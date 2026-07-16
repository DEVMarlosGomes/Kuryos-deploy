import asyncio
import os
import sys
from types import SimpleNamespace

sys.path.insert(0, os.path.abspath("backend"))

import crm_routes
import pd_routes


class FakeResult:
    def __init__(self, matched_count=1):
        self.matched_count = matched_count


class TrackingCollection:
    def __init__(self, docs=None):
        self.docs = [dict(doc) for doc in (docs or [])]
        self.update_calls = []
        self.insert_calls = []

    async def find_one(self, query, projection=None):
        for doc in self.docs:
            if self._matches(doc, query):
                return self._project(doc, projection)
        return None

    async def insert_one(self, doc):
        snapshot = dict(doc)
        self.insert_calls.append(snapshot)
        self.docs.append(snapshot)
        return FakeResult()

    async def update_one(self, query, update):
        self.update_calls.append((dict(query), update))
        for doc in self.docs:
            if not self._matches(doc, query):
                continue
            for key, value in (update.get("$set") or {}).items():
                if "." not in key:
                    doc[key] = value
            for key, value in (update.get("$push") or {}).items():
                if "." not in key:
                    doc.setdefault(key, [])
                    doc[key].append(value)
            return FakeResult(matched_count=1)
        return FakeResult(matched_count=0)

    def _matches(self, doc, query):
        for key, value in query.items():
            if "." not in key:
                if doc.get(key) != value:
                    return False
                continue

            head, tail = key.split(".", 1)
            current = doc.get(head)
            if isinstance(current, list):
                if not any(isinstance(item, dict) and item.get(tail) == value for item in current):
                    return False
                continue
            if not isinstance(current, dict) or current.get(tail) != value:
                return False
        return True

    def _project(self, doc, projection):
        if projection is None or projection.get("_id") != 0:
            return dict(doc)
        return {key: value for key, value in doc.items() if key != "_id"}


def test_bootstrap_syncs_card_and_sample_to_development(monkeypatch):
    sample_doc = {
        "id": "sample-1",
        "tenant_id": "tenant-1",
        "nome_produto": "Base Teste",
        "quantidade_por_variacao": 15,
        "unidade_quantidade": "ml",
        "variacoes": [
            {
                "id": "var-1",
                "codigo": "2026-1001-A",
                "descricao_aplicacao": "Versão A",
                "percentual_fragrancia": 0,
            }
        ],
    }
    card_doc = {
        "id": "card-1",
        "tenant_id": "tenant-1",
        "status_pd": "solicitado",
        "amostra_id": "sample-1",
        "amostra_variacao_id": "var-1",
    }

    fake_db = SimpleNamespace(
        crm_samples=TrackingCollection([sample_doc]),
        pd_requests=TrackingCollection([{"id": "req-1", "tenant_id": "tenant-1", "status": "OPEN"}]),
        pd_request_status_history=TrackingCollection(),
        pd_developments=TrackingCollection(),
        pd_formulas=TrackingCollection(),
        pd_formula_items=TrackingCollection(),
        pd_cards=TrackingCollection([card_doc]),
    )
    crm_routes.db = fake_db
    crm_routes._broadcast_event = None

    generated_ids = iter(["hist-1", "dev-1", "formula-1"])
    monkeypatch.setattr(crm_routes, "_new_id", lambda: next(generated_ids))
    monkeypatch.setattr(crm_routes, "_now_iso", lambda: "2026-07-15T15:00:00+00:00")

    async def fake_audit_log(**_kwargs):
        return None

    monkeypatch.setattr(crm_routes, "audit_log", fake_audit_log)

    user = {"id": "user-1", "name": "Tester", "tenant_id": "tenant-1"}
    card_payload = dict(card_doc)

    asyncio.run(
        crm_routes._bootstrap_pd_development_for_variacao(
            pd_request_id="req-1",
            card=card_payload,
            user=user,
        )
    )

    assert fake_db.pd_requests.docs[0]["status"] == "IN_PROGRESS"
    assert fake_db.pd_cards.docs[0]["status_pd"] == "em_desenvolvimento"
    assert fake_db.pd_cards.docs[0]["pd_request_id"] == "req-1"
    assert fake_db.pd_request_status_history.insert_calls[-1]["to_status"] == "IN_PROGRESS"

    sample_update = fake_db.crm_samples.update_calls[-1][1]["$set"]
    assert sample_update["variacoes.$.status"] == "em_elaboracao"
    assert sample_update["variacoes.$.status_pd_raw"] == "em_desenvolvimento"
    assert sample_update["variacoes.$.status_pd_label"] == "Em Desenvolvimento"


def test_save_lab_results_auto_moves_request_to_tests(monkeypatch):
    fake_db = SimpleNamespace(
        pd_developments=TrackingCollection(
            [{"id": "dev-1", "tenant_id": "tenant-1", "pd_request_id": "req-1"}]
        ),
        pd_lab_results=TrackingCollection(),
        pd_requests=TrackingCollection(
            [
                {
                    "id": "req-1",
                    "tenant_id": "tenant-1",
                    "status": "IN_PROGRESS",
                    "linked_pd_card_id": "card-1",
                }
            ]
        ),
        pd_cards=TrackingCollection(
            [
                {
                    "id": "card-1",
                    "tenant_id": "tenant-1",
                    "pd_request_id": "req-1",
                    "status_pd": "em_desenvolvimento",
                    "amostra_id": "sample-1",
                    "amostra_variacao_id": "var-1",
                }
            ]
        ),
        crm_samples=TrackingCollection(
            [{"id": "sample-1", "tenant_id": "tenant-1", "variacoes": [{"id": "var-1"}]}]
        ),
        pd_request_status_history=TrackingCollection(),
    )
    pd_routes.db = fake_db
    pd_routes._broadcast_event = None
    pd_routes.new_id_func = lambda: "hist-lab-1"
    pd_routes.now_iso_func = lambda: "2026-07-15T16:00:00+00:00"

    async def fake_get_current_user(_request):
        return {"id": "user-1", "name": "Tester", "tenant_id": "tenant-1"}

    async def fake_auto_generate_documents(*_args, **_kwargs):
        return None

    monkeypatch.setattr(pd_routes, "get_current_user", fake_get_current_user)
    monkeypatch.setattr(pd_routes, "_auto_generate_documents_for_development", fake_auto_generate_documents)

    result = asyncio.run(
        pd_routes.save_lab_results(
            "dev-1",
            pd_routes.LabResultsUpdate(ph={"valor_medido": "5.5"}),
            SimpleNamespace(),
        )
    )

    assert result["ph"] == {"valor_medido": "5.5"}
    assert fake_db.pd_requests.docs[0]["status"] == "IN_TESTS"
    assert fake_db.pd_cards.docs[0]["status_pd"] == "em_testes"
    assert fake_db.pd_request_status_history.insert_calls[-1]["to_status"] == "IN_TESTS"

    sample_update = fake_db.crm_samples.update_calls[-1][1]["$set"]
    assert sample_update["variacoes.$.status_pd_raw"] == "em_testes"
    assert sample_update["variacoes.$.status_pd_label"] == "Em Testes"
