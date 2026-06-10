import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useAuth } from "@/contexts/AuthContext";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight,
  BarChart3,
  FileSpreadsheet,
  Sparkles,
  Zap,
  LogIn,
  LogOut,
  Users,
  Mail,
  Phone,
  MessageSquare,
  HelpCircle,
  CheckCircle2,
  Crown,
  Star,
  Building2,
} from "lucide-react";

const Index = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut();
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  // Team members data
  const teamMembers = [
    {
      name: "João Vitor Cavalheiro",
      role: "LÍDER PRODUTIVO",
    },
    {
      name: "Ryan Raber",
      role: "LÍDER DE TECNOLOGIA",
    },
    {
      name: "Marlon Luiz Zanchet",
      role: "HEAD DE VALIDAÇÃO",
    },
  ];

  // Plans data (placeholders)
  const plans = [
    {
      name: "Essencial",
      price: "Consulte",
      description: "Ideal para escritórios iniciantes",
      features: [
        "Upload de arquivos DRE e Balanço",
        "Análises automáticas básicas",
        "Até 10 empresas cadastradas",
        "Suporte por e-mail",
      ],
    },
    {
      name: "Profissional",
      price: "Consulte",
      description: "Para escritórios em crescimento",
      features: [
        "Tudo do plano Essencial",
        "Análises avançadas com IA",
        "Empresas ilimitadas",
        "Relatórios personalizados",
        "Suporte prioritário",
      ],
      highlighted: true,
    },
    {
      name: "Enterprise",
      price: "Sob medida",
      description: "Para grandes operações",
      features: [
        "Tudo do plano Profissional",
        "API para integrações",
        "Treinamento personalizado",
        "Gerente de conta dedicado",
        "SLA garantido",
      ],
    },
  ];

  // FAQ data
  const faqItems = [
    {
      question: "Para quem é o KlarCont?",
      answer:
        "O KlarCont foi desenvolvido para contadores, escritórios de contabilidade e profissionais financeiros que desejam automatizar análises de DRE e Balanço Patrimonial, gerando insights visuais e relatórios profissionais de forma rápida e eficiente.",
    },
    {
      question: "Como funciona o KlarCont?",
      answer:
        "Basta enviar seus arquivos de DRE e Balanço Patrimonial (CSV, XLS ou XLSX), e o sistema automaticamente processa os dados, identifica as contas contábeis brasileiras e gera dashboards visuais com indicadores, margens e insights automatizados.",
    },
    {
      question: "O KlarCont está preparado para a reforma tributária?",
      answer:
        "Sim! O KlarCont está em constante atualização para acompanhar as mudanças da reforma tributária brasileira. Nossa equipe trabalha continuamente para garantir que as análises estejam sempre alinhadas com as novas exigências fiscais e contábeis.",
    },
    {
      question: "Quais formatos de arquivo são aceitos?",
      answer:
        "O KlarCont aceita arquivos nos formatos CSV, XLS e XLSX. O sistema possui inteligência para reconhecer automaticamente a estrutura das demonstrações financeiras em padrão brasileiro.",
    },
  ];

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background effects */}
      <div className="hero-glow w-full h-[600px] top-0 left-0" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-primary/5 rounded-full blur-3xl" />

      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <Logo />
          <div className="hidden md:flex items-center gap-6">
            <button
              onClick={() => scrollToSection("inicio")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Início
            </button>
            <button
              onClick={() => scrollToSection("quem-somos")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Quem Somos
            </button>
            <button
              onClick={() => scrollToSection("planos")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Planos
            </button>
            <button
              onClick={() => scrollToSection("feedbacks")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Feedbacks
            </button>
            <button
              onClick={() => scrollToSection("contato")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Contato
            </button>
            <button
              onClick={() => scrollToSection("faq")}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              FAQ
            </button>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            {user ? (
              <>
                <Link to="/empresas">
                  <Button variant="ghost" size="sm">
                    Empresas
                  </Button>
                </Link>
                <Link to="/upload">
                  <Button variant="neon" size="sm">
                    Upload
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Sair
                </Button>
              </>
            ) : (
              <Link to="/auth">
                <Button variant="neon" size="sm">
                  <LogIn className="w-4 h-4 mr-2" />
                  Entrar
                </Button>
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section - Início */}
      <section id="inicio" className="relative z-10 pt-32 pb-24">
        <div className="container mx-auto px-6">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20 mb-8 animate-fade-in"
              style={{ animationDelay: "0.1s" }}
            >
              <Sparkles className="w-4 h-4 text-primary" />
              <span className="text-sm text-primary font-medium">
                Análise Financeira com IA
              </span>
            </div>

            {/* Headline */}
            <h1
              className="font-display text-5xl md:text-7xl font-bold mb-6 animate-fade-in"
              style={{ animationDelay: "0.2s" }}
            >
              Transforme dados contábeis em{" "}
              <span className="gradient-text">decisões estratégicas</span>
            </h1>

            {/* Context about the reform */}
            <div
              className="text-lg text-muted-foreground mb-8 max-w-3xl mx-auto space-y-4 animate-fade-in"
              style={{ animationDelay: "0.3s" }}
            >
              <p>
                A contabilidade brasileira atravessa um momento de transformação. A{" "}
                <strong className="text-foreground">reforma tributária</strong> traz desafios
                inéditos: novas obrigações, adaptações nos sistemas e maior complexidade na
                análise de resultados.
              </p>
              <p>
                O <strong className="text-primary">KlarCont</strong> nasce para simplificar essa
                transição. Automatizamos a análise de DRE e Balanço Patrimonial, gerando insights
                visuais e relatórios profissionais que ajudam você a tomar decisões com{" "}
                <strong className="text-foreground">clareza, organização e inteligência de dados</strong>.
              </p>
            </div>

            {/* CTA Buttons */}
            <div
              className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16 animate-fade-in"
              style={{ animationDelay: "0.4s" }}
            >
              <Link to="/showcase">
                <Button variant="hero" size="xl" className="group">
                  Conheça o KlarCont
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </Button>
              </Link>
              <Link to={user ? "/upload" : "/auth"}>
                <Button variant="glass" size="xl">
                  {user ? "Enviar Arquivos" : "Começar Agora"}
                </Button>
              </Link>
            </div>

            {/* Features */}
            <div
              className="grid md:grid-cols-3 gap-6 animate-fade-in"
              style={{ animationDelay: "0.5s" }}
            >
              <div className="glass-card p-6 text-left">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-4">
                  <FileSpreadsheet className="w-6 h-6 text-primary" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2">Upload Simples</h3>
                <p className="text-sm text-muted-foreground">
                  Envie arquivos CSV, XLS ou XLSX de DRE e Balanço Patrimonial com facilidade.
                </p>
              </div>

              <div className="glass-card p-6 text-left">
                <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center mb-4">
                  <Zap className="w-6 h-6 text-secondary" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2">Processamento Rápido</h3>
                <p className="text-sm text-muted-foreground">
                  Sistema inteligente que reconhece automaticamente as contas contábeis brasileiras.
                </p>
              </div>

              <div className="glass-card p-6 text-left">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mb-4">
                  <BarChart3 className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-display font-semibold text-lg mb-2">Dashboards Visuais</h3>
                <p className="text-sm text-muted-foreground">
                  Indicadores, margens e insights gerados automaticamente em formato visual.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quem Somos */}
      <section id="quem-somos" className="relative z-10 py-24 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl font-bold mb-4">
              <span className="gradient-text">Quem Somos</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Uma equipe dedicada a transformar a forma como profissionais contábeis trabalham
              com análises financeiras.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {teamMembers.map((member, index) => (
              <Card
                key={index}
                className="glass-card text-center hover:scale-[1.02] transition-all duration-300"
              >
                <CardContent className="pt-8 pb-6">
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary/20 to-secondary/20 flex items-center justify-center mx-auto mb-6">
                    <Users className="w-10 h-10 text-primary" />
                  </div>
                  <h3 className="font-display font-semibold text-xl mb-2">{member.name}</h3>
                  <span className="inline-block px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-medium">
                    {member.role}
                  </span>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Planos */}
      <section id="planos" className="relative z-10 py-24">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl font-bold mb-4">
              <span className="gradient-text">Planos</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Escolha o plano ideal para o seu escritório ou empresa.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <Card
                key={index}
                className={`glass-card relative overflow-hidden transition-all duration-300 hover:scale-[1.02] ${
                  plan.highlighted
                    ? "ring-2 ring-primary shadow-lg shadow-primary/20"
                    : ""
                }`}
              >
                {plan.highlighted && (
                  <div className="absolute top-0 left-0 right-0 bg-gradient-to-r from-primary to-secondary py-1.5 text-center">
                    <span className="text-xs font-medium text-white flex items-center justify-center gap-1">
                      <Crown className="w-3 h-3" />
                      Mais Popular
                    </span>
                  </div>
                )}
                <CardContent className={`pt-8 pb-6 ${plan.highlighted ? "pt-14" : ""}`}>
                  <div className="text-center mb-6">
                    <h3 className="font-display font-semibold text-2xl mb-2">{plan.name}</h3>
                    <p className="text-muted-foreground text-sm mb-4">{plan.description}</p>
                    <div className="font-display text-3xl font-bold text-primary">
                      {plan.price}
                    </div>
                  </div>
                  <ul className="space-y-3">
                    {plan.features.map((feature, fIndex) => (
                      <li key={fIndex} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    variant={plan.highlighted ? "hero" : "outline"}
                    className="w-full mt-6"
                    onClick={() => navigate("/planos")}
                  >
                    Saiba Mais
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Feedbacks */}
      <section id="feedbacks" className="relative z-10 py-24 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl font-bold mb-4">
              <span className="gradient-text">Feedbacks</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              O que nossos primeiros usuários estão dizendo sobre o KlarCont.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[1, 2, 3].map((_, index) => (
              <Card
                key={index}
                className="glass-card hover:scale-[1.02] transition-all duration-300"
              >
                <CardContent className="pt-6 pb-6">
                  <div className="flex items-center gap-1 mb-4">
                    {[...Array(5)].map((_, i) => (
                      <Star
                        key={i}
                        className="w-4 h-4 text-yellow-500 fill-yellow-500"
                      />
                    ))}
                  </div>
                  <MessageSquare className="w-8 h-8 text-primary/50 mb-3" />
                  <p className="text-muted-foreground italic mb-4">
                    "Feedback da equipe KlarCont será inserido aqui. Esta seção está preparada
                    para receber depoimentos reais de clientes e parceiros."
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <Building2 className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Equipe KlarCont</p>
                      <p className="text-xs text-muted-foreground">Em breve</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="text-center text-sm text-muted-foreground mt-8">
            Os feedbacks serão adicionados pela equipe KlarCont à medida que recebemos retornos
            de nossos usuários.
          </p>
        </div>
      </section>

      {/* Contato */}
      <section id="contato" className="relative z-10 py-24">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl font-bold mb-4">
              <span className="gradient-text">Contato</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Entre em contato conosco para saber mais sobre o KlarCont.
            </p>
          </div>

          <div className="max-w-md mx-auto">
            <Card className="glass-card">
              <CardContent className="pt-8 pb-8">
                <div className="space-y-6">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                      <Mail className="w-6 h-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">E-mail</p>
                      <a
                        href="mailto:KlarCont@gmail.com"
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        KlarCont@gmail.com
                      </a>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-secondary/10 flex items-center justify-center">
                      <Phone className="w-6 h-6 text-secondary" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Telefone</p>
                      <a
                        href="tel:+5554996688252"
                        className="font-medium text-foreground hover:text-primary transition-colors"
                      >
                        (54) 99668-8252
                      </a>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="relative z-10 py-24 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="font-display text-4xl font-bold mb-4">
              <span className="gradient-text">Perguntas Frequentes</span>
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto">
              Tire suas dúvidas sobre o KlarCont.
            </p>
          </div>

          <div className="max-w-2xl mx-auto">
            <Accordion type="single" collapsible className="space-y-4">
              {faqItems.map((item, index) => (
                <AccordionItem
                  key={index}
                  value={`item-${index}`}
                  className="glass-card border-none px-6"
                >
                  <AccordionTrigger className="text-left font-medium hover:text-primary">
                    <div className="flex items-center gap-3">
                      <HelpCircle className="w-5 h-5 text-primary flex-shrink-0" />
                      {item.question}
                    </div>
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground pl-8">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border py-12">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <Logo />
            <div className="text-center text-sm text-muted-foreground">
              © {new Date().getFullYear()} KlarCont. Análise financeira inteligente para
              escritórios contábeis.
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => scrollToSection("inicio")}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Voltar ao topo
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default Index;
