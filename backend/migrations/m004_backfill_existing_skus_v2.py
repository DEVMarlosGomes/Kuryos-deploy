import argparse
import asyncio
import os
import re
import sys
import uuid
from datetime import datetime, timezone

import motor.motor_asyncio

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import crm_routes
import produtos_routes
import workflow_engine
from produtos_routes import find_or_create_produto_pai, _vincular_sku_ao_produto_pai_internal
from workflow_engine import build_sku_code_v2, cat2_from_categoria, cat3_from_categoria, next_sku_per_pair_v2, normalise_cli3, normalise_cli4


MONGO_URL = os.environ.get("MONGO_URL", "mongodb://127.0.0.1:27017")
DB_NAME = os.environ.get("DB_NAME", "kuryos_crm")
SYSTEM_USER_ID = "system-sku-backfill"
SYSTEM_USER_NAME = "SKU Backfill"
LEGACY_CATEGORY_ALIASES = {
    "haircare": "CAP",
    "bodycare": "COR",
}


def new_id() -> str:
    return str(uuid.uuid4())


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def resolve_cat3(sample: dict, project: dict) -> str:
    categoria = sample.get("categoria") or (project or {}).get("categoria") or ""
    cat3 = await crm_routes.resolve_cat3_from_categoria(categoria, sample["tenant_id"])
    if cat3:
        return cat3
    alias = LEGACY_CATEGORY_ALIASES.get((categoria or "").strip().lower())
    if alias:
        return alias
    return cat3_from_categoria(categoria)


async def get_next_seq(db, tenant_id: str, cat3: str, cli4: str, *, dry_run: bool, seq_cache: dict) -> int:
    key = (tenant_id, cat3, cli4)
    if dry_run:
        if key not in seq_cache:
            pattern = re.compile(rf"^{re.escape(cat3.upper())}-{re.escape(cli4.upper())}-(\d{{4}})$")
            max_seq = 0
            async for sku in db.skus.find(
                {"tenant_id": tenant_id, "cat3": cat3.upper(), "cli4": cli4.upper()},
                {"_id": 0, "codigo_interno": 1},
            ):
                match = pattern.match(sku.get("codigo_interno", ""))
                if match:
                    max_seq = max(max_seq, int(match.group(1)))
            seq_cache[key] = max_seq
        seq_cache[key] += 1
        return seq_cache[key]
    return await next_sku_per_pair_v2(tenant_id, cat3, cli4)


async def ensure_variacao_sku(db, sample: dict, project: dict, client: dict, variacao: dict, *, dry_run: bool, seq_cache: dict) -> tuple[str, str]:
    tenant_id = sample["tenant_id"]

    existing = await db.skus.find_one(
        {"tenant_id": tenant_id, "amostra_variacao_id": variacao["id"]},
        {"_id": 0, "id": 1, "codigo_interno": 1},
    )
    if existing:
        if not variacao.get("sku_id") and not dry_run:
            await db.crm_samples.update_one(
                {"id": sample["id"], "variacoes.id": variacao["id"]},
                {"$set": {"variacoes.$.sku_id": existing["id"], "variacoes.$.gera_sku": True, "updated_at": now_iso()}},
            )
        return "reused", existing["codigo_interno"]

    cat3 = await resolve_cat3(sample, project)
    categoria = sample.get("categoria") or (project or {}).get("categoria") or ""
    cli4 = normalise_cli4(client.get("cli4") or client.get("nome_empresa", ""))
    seq = await get_next_seq(db, tenant_id, cat3, cli4, dry_run=dry_run, seq_cache=seq_cache)
    codigo = build_sku_code_v2(cat3, cli4, seq)
    crm_routes._assert_valid_sku_code(codigo)

    nome_base = sample.get("nome_amostra", "") or sample.get("nome_produto", "")
    sku_id = new_id()
    sku = {
        "id": sku_id,
        "tenant_id": tenant_id,
        "codigo_interno": codigo,
        "cat3": cat3,
        "cli4": cli4,
        "cat2": cat2_from_categoria(categoria),
        "cli3": normalise_cli3(client.get("cli3") or client.get("nome_empresa", "")),
        "nome_produto": f"{nome_base} - {variacao.get('codigo', '')}".strip(" -"),
        "categoria": categoria,
        "formula_vinculada": "",
        "cliente_id": sample["cliente_id"],
        "cliente_nome": sample.get("cliente_nome", ""),
        "projeto_id": sample["projeto_id"],
        "projeto_nome": sample.get("projeto_nome", ""),
        "amostra_id": sample["id"],
        "amostra_variacao_id": variacao["id"],
        "descricao_aplicacao": variacao.get("descricao_aplicacao", ""),
        "produto_pai_id": None,
        "preco_unitario": variacao.get("custo_fragrancia") or 0.0,
        "moq": 0,
        "anvisa": {"numero": "", "validade": None},
        "status": "ativo",
        "descontinuado_motivo": None,
        "descontinuado_em": None,
        "descontinuado_por": None,
        "historico_pedidos": [],
        "data_ultimo_pedido": None,
        "frequencia_media_recompra_dias": 0,
        "medias_producao": {
            "media_geral_unh": None,
            "media_12m_unh": None,
            "media_3m_unh": None,
            "media_1m_unh": None,
            "meta_unh": None,
            "ajuste_percentual": 0,
            "meta_set_by": None,
            "meta_set_at": None,
            "historico_producao": [],
        },
        "created_at": now_iso(),
        "updated_at": now_iso(),
    }

    if dry_run:
        return "would_create", codigo

    await db.skus.insert_one(sku)
    await db.crm_samples.update_one(
        {"id": sample["id"], "variacoes.id": variacao["id"]},
        {"$set": {"variacoes.$.sku_id": sku_id, "variacoes.$.gera_sku": True, "updated_at": now_iso()}},
    )

    if not client.get("cli4_congelado"):
        await db.crm_clients.update_one(
            {"id": sample["cliente_id"], "tenant_id": tenant_id},
            {"$set": {"cli4_congelado": True, "updated_at": now_iso()}},
        )

    try:
        produto_pai = await find_or_create_produto_pai(
            nome=nome_base,
            cliente_id=sample["cliente_id"],
            tenant_id=tenant_id,
            user_id=SYSTEM_USER_ID,
            user_name=SYSTEM_USER_NAME,
        )
        await _vincular_sku_ao_produto_pai_internal(
            produto_pai_id=produto_pai["id"],
            sku_id=sku_id,
            tenant_id=tenant_id,
        )
    except Exception as exc:
        print(f"[WARN] SKU {codigo} criado sem vinculo a produto-pai: {exc}")

    return "created", codigo


async def backfill(dry_run: bool) -> None:
    client = motor.motor_asyncio.AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    workflow_engine.init_workflow(db, new_id, now_iso)
    produtos_routes.init_produtos(db, lambda _request: None, new_id, now_iso)
    crm_routes.db = db
    crm_routes._new_id = new_id
    crm_routes._now_iso = now_iso

    created = 0
    reused = 0
    would_create = 0
    skipped = 0
    seq_cache = {}

    samples = await db.crm_samples.find({}, {"_id": 0}).sort("created_at", 1).to_list(10000)
    for sample in samples:
        project = await db.crm_projects.find_one({"id": sample["projeto_id"], "tenant_id": sample["tenant_id"]}, {"_id": 0})
        client_doc = await db.crm_clients.find_one({"id": sample["cliente_id"], "tenant_id": sample["tenant_id"]}, {"_id": 0})

        if not project or not client_doc:
            skipped += len(sample.get("variacoes") or [])
            print(f"[SKIP] sample={sample['id']} sem projeto/cliente valido")
            continue

        variacoes = sample.get("variacoes") or []
        for variacao in variacoes:
            try:
                action, codigo = await ensure_variacao_sku(
                    db,
                    sample,
                    project,
                    client_doc,
                    variacao,
                    dry_run=dry_run,
                    seq_cache=seq_cache,
                )
                if action == "created":
                    created += 1
                    print(f"[CREATED] {codigo} <- sample={sample['id']} variacao={variacao['codigo']}")
                elif action == "reused":
                    reused += 1
                    print(f"[REUSED] {codigo} <- sample={sample['id']} variacao={variacao['codigo']}")
                elif action == "would_create":
                    would_create += 1
                    print(f"[DRY-RUN] {codigo} <- sample={sample['id']} variacao={variacao['codigo']}")
            except Exception as exc:
                skipped += 1
                print(f"[SKIP] sample={sample['id']} variacao={variacao.get('codigo')} erro={exc}")

    print("")
    print("Backfill finalizado")
    print(f"db={DB_NAME}")
    print(f"created={created}")
    print(f"reused={reused}")
    print(f"would_create={would_create}")
    print(f"skipped={skipped}")
    print(f"total_skus={await db.skus.count_documents({})}")

    client.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Backfill de SKU v2 para variacoes existentes.")
    parser.add_argument("--dry-run", action="store_true", help="Simula a geracao sem gravar no banco.")
    args = parser.parse_args()
    asyncio.run(backfill(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
