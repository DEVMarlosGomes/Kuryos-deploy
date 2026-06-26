import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
    const { user, loading, login, register } = useAuth();
    const [mode, setMode] = useState("login");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    const [loginForm, setLoginForm] = useState({ email: "", password: "" });
    const [regForm, setRegForm] = useState({ email: "", password: "", name: "", org_name: "" });

    if (loading) return (
        <div className="h-screen flex items-center justify-center bg-[#0f2044]">
            <KuryosLogo size={48} />
        </div>
    );
    if (user) return <Navigate to="/tasks" replace />;

    const handleLogin = async (e) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);
        const res = await login(loginForm.email, loginForm.password);
        if (!res.success) setError(res.error);
        setSubmitting(false);
    };

    const handleRegister = async (e) => {
        e.preventDefault();
        setError("");
        setSubmitting(true);
        const res = await register(regForm.email, regForm.password, regForm.name, regForm.org_name);
        if (!res.success) setError(res.error);
        setSubmitting(false);
    };

    return (
        <div className="min-h-screen flex" data-testid="login-page">
            {/* Left panel — brand */}
            <div className="hidden lg:flex lg:w-[55%] relative overflow-hidden bg-[#0f2044] flex-col justify-between p-14">
                {/* Subtle grid pattern */}
                <div className="absolute inset-0 opacity-[0.04]"
                    style={{ backgroundImage: "linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)", backgroundSize: "40px 40px" }} />

                {/* Floating accent circles */}
                <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl" />
                <div className="absolute bottom-0 -left-24 w-72 h-72 rounded-full bg-indigo-500/10 blur-3xl" />

                <div className="relative z-10">
                    <KuryosLogo size={40} />
                </div>

                <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 backdrop-blur-sm mb-8">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                        <span className="text-white/80 text-xs font-body tracking-wide">Sistema Operacional</span>
                    </div>
                    <h1 className="text-5xl font-heading font-light text-white tracking-tight leading-[1.1]">
                        Indústria de<br />
                        <span className="font-bold text-white">Cosméticos</span><br />
                        <span className="font-light text-white/60">reimaginada.</span>
                    </h1>
                    <p className="mt-6 text-white/50 text-base font-body max-w-sm leading-relaxed">
                        Do P&D à expedição — rastreabilidade completa, controle de qualidade e automação de workflows em uma única plataforma.
                    </p>
                </div>

                <div className="relative z-10 flex items-center gap-6">
                    {[["14+", "módulos"], ["900+", "endpoints"], ["Multi", "tenant"]].map(([val, label]) => (
                        <div key={label}>
                            <p className="text-2xl font-heading font-semibold text-white">{val}</p>
                            <p className="text-xs text-white/40 font-body uppercase tracking-wider">{label}</p>
                        </div>
                    ))}
                </div>
            </div>

            {/* Right panel — form */}
            <div className="flex-1 flex items-center justify-center p-6 sm:p-10 bg-background">
                <div className="w-full max-w-[400px]">

                    {/* Mobile logo */}
                    <div className="flex justify-center mb-8 lg:hidden">
                        <KuryosLogo size={36} />
                    </div>

                    <div className="mb-8">
                        <h2 className="text-2xl font-heading font-semibold tracking-tight">
                            {mode === "login" ? "Bem-vindo de volta" : "Criar nova conta"}
                        </h2>
                        <p className="text-sm text-muted-foreground mt-1">
                            {mode === "login"
                                ? "Entre com suas credenciais para acessar o sistema"
                                : "Preencha os dados para criar sua organização"}
                        </p>
                    </div>

                    {mode === "login" ? (
                        <form onSubmit={handleLogin} className="space-y-5" data-testid="login-form">
                            <div className="space-y-2">
                                <Label htmlFor="login-email">Email corporativo</Label>
                                <Input
                                    id="login-email"
                                    data-testid="login-email-input"
                                    type="email"
                                    placeholder="nome@empresa.com"
                                    autoComplete="email"
                                    value={loginForm.email}
                                    onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="login-password">Senha</Label>
                                <Input
                                    id="login-password"
                                    data-testid="login-password-input"
                                    type="password"
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    value={loginForm.password}
                                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                                    required
                                />
                            </div>
                            {error && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                                    <p className="text-sm text-destructive" data-testid="auth-error">{error}</p>
                                </div>
                            )}
                            <Button type="submit" className="w-full h-11 font-medium" disabled={submitting} data-testid="login-submit-btn">
                                {submitting ? (
                                    <span className="flex items-center gap-2">
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Entrando...
                                    </span>
                                ) : "Entrar"}
                            </Button>
                        </form>
                    ) : (
                        <form onSubmit={handleRegister} className="space-y-4" data-testid="register-form">
                            <div className="space-y-2">
                                <Label htmlFor="reg-name">Seu nome</Label>
                                <Input id="reg-name" data-testid="register-name-input" placeholder="Nome completo"
                                    value={regForm.name} onChange={(e) => setRegForm({ ...regForm, name: e.target.value })} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="reg-org">Nome da organização</Label>
                                <Input id="reg-org" data-testid="register-org-input" placeholder="Empresa Ltda."
                                    value={regForm.org_name} onChange={(e) => setRegForm({ ...regForm, org_name: e.target.value })} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="reg-email">Email</Label>
                                <Input id="reg-email" data-testid="register-email-input" type="email" placeholder="nome@empresa.com"
                                    value={regForm.email} onChange={(e) => setRegForm({ ...regForm, email: e.target.value })} required />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="reg-password">Senha</Label>
                                <Input id="reg-password" data-testid="register-password-input" type="password" placeholder="Mínimo 6 caracteres"
                                    value={regForm.password} onChange={(e) => setRegForm({ ...regForm, password: e.target.value })} required />
                            </div>
                            {error && (
                                <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                                    <p className="text-sm text-destructive" data-testid="auth-error">{error}</p>
                                </div>
                            )}
                            <Button type="submit" className="w-full h-11 font-medium" disabled={submitting} data-testid="register-submit-btn">
                                {submitting ? (
                                    <span className="flex items-center gap-2">
                                        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Criando conta...
                                    </span>
                                ) : "Criar Conta"}
                            </Button>
                        </form>
                    )}

                    <div className="mt-6 text-center">
                        {mode === "login" ? (
                            <p className="text-sm text-muted-foreground">
                                Não tem conta?{" "}
                                <button type="button" onClick={() => { setMode("register"); setError(""); }}
                                    className="text-primary font-medium hover:underline underline-offset-4">
                                    Criar organização
                                </button>
                            </p>
                        ) : (
                            <p className="text-sm text-muted-foreground">
                                Já tem acesso?{" "}
                                <button type="button" onClick={() => { setMode("login"); setError(""); }}
                                    className="text-primary font-medium hover:underline underline-offset-4">
                                    Entrar
                                </button>
                            </p>
                        )}
                    </div>

                    <p className="mt-10 text-center text-xs text-muted-foreground/50">
                        © {new Date().getFullYear()} Kuryos ERP. Todos os direitos reservados.
                    </p>
                </div>
            </div>
        </div>
    );
}

function KuryosLogo({ size = 32 }) {
    return (
        <div className="flex items-center gap-3">
            <div
                className="rounded-lg bg-[#0f2044] flex items-center justify-center flex-shrink-0 shadow-lg"
                style={{ width: size * 1.1, height: size * 1.1 }}
            >
                <svg viewBox="0 0 32 32" width={size * 0.7} height={size * 0.7} fill="none">
                    <text x="16" y="24" fontFamily="Georgia,serif" fontSize="22" fontWeight="700"
                        fill="#ffffff" textAnchor="middle">K</text>
                </svg>
            </div>
            <div className="leading-none">
                <p className="text-white font-heading font-bold tracking-[0.12em] uppercase"
                    style={{ fontSize: size * 0.45 }}>Kuryos</p>
                <p className="text-white/40 font-body uppercase tracking-[0.15em]"
                    style={{ fontSize: size * 0.22 }}>ERP</p>
            </div>
        </div>
    );
}
