import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Lock, Sparkles } from "lucide-react";
import api from "@/lib/api";

/**
 * Campo CLI4 (4 letras usadas no SKU novo CAT3-CLI4-SEQ, build_sku_code_v2).
 * O backend já suporta cli4/suggest-cli4/conflito há tempo (R23) mas não havia
 * UI nenhuma para ele — o front só coletava o CLI3 do formato de SKU antigo (A3).
 */
export function Cli4Field({ value, onChange, nomeEmpresa, frozen = false, disabled = false }) {
    const [suggestions, setSuggestions] = useState(null);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);

    const fetchSuggestions = async () => {
        if (!nomeEmpresa?.trim()) return;
        setLoadingSuggestions(true);
        try {
            const { data } = await api.get("/crm/clients/suggest-cli4", { params: { nome: nomeEmpresa } });
            setSuggestions(data.sugestoes || []);
        } catch {
            setSuggestions([]);
        } finally {
            setLoadingSuggestions(false);
        }
    };

    if (frozen) {
        return (
            <div className="space-y-2">
                <Label className="flex items-center gap-1 text-xs">
                    Código Cliente (CLI4) <span className="text-[10px] text-muted-foreground font-normal">— usado no código SKU</span>
                </Label>
                <div className="flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/50 text-sm font-mono uppercase tracking-widest">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    {value || "----"}
                </div>
                <p className="text-[10px] text-muted-foreground">Congelado — já existe SKU gerado para este cliente, o código não pode mais ser alterado.</p>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            <Label className="flex items-center gap-1 text-xs">
                Código Cliente (CLI4) <span className="text-[10px] text-muted-foreground font-normal">— usado no código SKU novo</span>
            </Label>
            <div className="flex items-center gap-2">
                <Input
                    className="font-mono uppercase text-center tracking-widest"
                    maxLength={4}
                    placeholder="ABCD"
                    value={value || ""}
                    disabled={disabled}
                    onChange={(e) => onChange(e.target.value.replace(/[^a-zA-Z]/g, "").toUpperCase().slice(0, 4))}
                />
                <Button type="button" variant="outline" size="sm" disabled={disabled || loadingSuggestions || !nomeEmpresa?.trim()} onClick={fetchSuggestions}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" /> Sugerir
                </Button>
            </div>
            {value && value.length > 0 && value.length < 4 && (
                <p className="text-[10px] text-amber-600">Precisa de exatamente 4 letras. Se vazio, o backend sugere automaticamente a partir do nome da empresa.</p>
            )}
            {Array.isArray(suggestions) && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                    {suggestions.length === 0 && <span className="text-[10px] text-muted-foreground">Nenhuma sugestão disponível.</span>}
                    {suggestions.map((s) => (
                        <button
                            key={s.cli4}
                            type="button"
                            disabled={!s.disponivel}
                            onClick={() => onChange(s.cli4)}
                            title={s.disponivel ? "Usar este código" : `Já em uso por ${s.ocupado_por}`}
                            className={`px-2 py-0.5 rounded text-[11px] font-mono font-semibold border transition-colors ${
                                s.disponivel
                                    ? "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-300"
                                    : "border-border bg-muted text-muted-foreground/50 cursor-not-allowed line-through"
                            }`}
                        >
                            {s.cli4}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

export default Cli4Field;
