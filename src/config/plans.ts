// TODO: Substitua estes IDs pelos priceIds reais retornados pela Edge Function
// `setup-stripe-plans` (execute-a uma vez no Stripe LIVE).
export const PLAN_PRICE_IDS = {
  basico: { productId: "prod_UvSrejlgHb7M7R", priceId: "price_1TvbwAFZbI5npYGNwTJLML3I" },
  intermediario: { productId: "prod_UvSreDuU97sJRw", priceId: "price_1TvbwAFZbI5npYGNigHCZVYA" },
  premium: { productId: "prod_UvSrlF4JjARz5Z", priceId: "price_1TvbwBFZbI5npYGNT2SVJnba" },
} as const;

export type PlanType = "sem_plano" | "basico" | "intermediario" | "premium";

export const PLAN_CONFIG = {
  sem_plano: {
    nome: "Sem Plano",
    preco: 0,
    max_empresas: 0,
    features: {
      faturamento: false,
      simulador: false,
      link_cliente: false,
      whitelabel: false,
    },
  },
  basico: {
    nome: "Básico",
    preco: 250,
    max_empresas: 5,
    features: {
      faturamento: false,
      simulador: false,
      link_cliente: false,
      whitelabel: false,
    },
  },
  intermediario: {
    nome: "Intermediário",
    preco: 400,
    max_empresas: 10,
    features: {
      faturamento: true,
      simulador: true,
      link_cliente: false,
      whitelabel: false,
    },
  },
  premium: {
    nome: "Premium",
    preco: 550,
    max_empresas: 20,
    features: {
      faturamento: true,
      simulador: true,
      link_cliente: true,
      whitelabel: true,
    },
  },
} as const;
