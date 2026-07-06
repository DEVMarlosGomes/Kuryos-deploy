import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Impede que uma exceção de render não tratada derrube a árvore inteira ("tela branca").
 * Usa `resetKey` para remontar o conteúdo protegido quando o contexto muda (ex: troca de aba/registro).
 */
export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary]", error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-500" />
          <div>
            <p className="text-sm font-medium">Não foi possível carregar esta seção.</p>
            <p className="text-xs text-muted-foreground mt-1">
              {this.props.label ? `Erro em: ${this.props.label}. ` : ""}
              Isso não afeta as demais abas — tente novamente.
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={() => this.setState({ error: null })}>
            Tentar novamente
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
