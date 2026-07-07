-- PromoPilot 360 V2 - Inteligencia de ofertas, cupons e SEO programatico

CREATE TABLE "price_history" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "marketplace_id" TEXT,
    "preco" DECIMAL(12,2) NOT NULL,
    "preco_anterior" DECIMAL(12,2),
    "menor_preco_30d" DECIMAL(12,2),
    "media_preco_30d" DECIMAL(12,2),
    "maior_preco_90d" DECIMAL(12,2),
    "percentual_desconto_informado" DECIMAL(5,2),
    "percentual_desconto_real" DECIMAL(5,2),
    "status_desconto" VARCHAR(50),
    "origem" VARCHAR(120),
    "data_coleta" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "price_history_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offer_scores" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "score_total" DECIMAL(5,2) NOT NULL,
    "score_preco" DECIMAL(5,2),
    "score_desconto" DECIMAL(5,2),
    "score_avaliacao" DECIMAL(5,2),
    "score_vendas" DECIMAL(5,2),
    "score_comissao" DECIMAL(5,2),
    "score_cupom" DECIMAL(5,2),
    "score_frete" DECIMAL(5,2),
    "score_reputacao" DECIMAL(5,2),
    "score_seo" DECIMAL(5,2),
    "classificacao" VARCHAR(80),
    "justificativa" TEXT,
    "recomendado" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "offer_scores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupons" (
    "id" TEXT NOT NULL,
    "marketplace_id" TEXT NOT NULL,
    "codigo" VARCHAR(100) NOT NULL,
    "titulo" VARCHAR(180),
    "descricao" TEXT,
    "percentual_desconto" DECIMAL(5,2),
    "valor_desconto" DECIMAL(12,2),
    "valor_minimo" DECIMAL(12,2),
    "data_inicio" TIMESTAMP(3),
    "data_fim" TIMESTAMP(3),
    "status" BOOLEAN NOT NULL DEFAULT true,
    "origem" VARCHAR(120),
    "url_origem" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupon_products" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupon_products_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "coupon_categories" (
    "id" TEXT NOT NULL,
    "coupon_id" TEXT NOT NULL,
    "category_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coupon_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "seo_pages" (
    "id" TEXT NOT NULL,
    "product_id" TEXT,
    "category_id" TEXT,
    "marketplace_id" TEXT,
    "tipo" VARCHAR(80) NOT NULL,
    "slug" TEXT NOT NULL,
    "titulo_seo" TEXT NOT NULL,
    "meta_description" TEXT,
    "h1" TEXT,
    "conteudo" TEXT,
    "faq" JSONB,
    "schema_json" JSONB,
    "palavra_chave_principal" TEXT,
    "palavras_chave_secundarias" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "status" VARCHAR(50) NOT NULL DEFAULT 'rascunho',
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),
    CONSTRAINT "seo_pages_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "seo_keywords" (
    "id" TEXT NOT NULL,
    "termo" TEXT NOT NULL,
    "volume_busca" INTEGER,
    "dificuldade" DECIMAL(5,2),
    "intencao" VARCHAR(80),
    "categoria" VARCHAR(120),
    "origem" VARCHAR(120),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "seo_keywords_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "product_opportunities" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "score_id" TEXT,
    "tipo" VARCHAR(80),
    "titulo" TEXT,
    "descricao" TEXT,
    "prioridade" VARCHAR(40),
    "status" VARCHAR(40) NOT NULL DEFAULT 'aberta',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "product_opportunities_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coupons_marketplace_codigo_key" ON "coupons"("marketplace_id", "codigo");
CREATE UNIQUE INDEX "coupon_products_coupon_product_key" ON "coupon_products"("coupon_id", "product_id");
CREATE UNIQUE INDEX "coupon_categories_coupon_category_key" ON "coupon_categories"("coupon_id", "category_id");
CREATE UNIQUE INDEX "seo_pages_slug_key" ON "seo_pages"("slug");

CREATE INDEX "idx_price_history_product" ON "price_history"("product_id");
CREATE INDEX "idx_price_history_data" ON "price_history"("data_coleta");
CREATE INDEX "idx_price_history_marketplace" ON "price_history"("marketplace_id");
CREATE INDEX "idx_offer_scores_product" ON "offer_scores"("product_id");
CREATE INDEX "idx_offer_scores_total" ON "offer_scores"("score_total" DESC);
CREATE INDEX "idx_offer_scores_recomendado" ON "offer_scores"("recomendado");
CREATE INDEX "idx_coupons_marketplace" ON "coupons"("marketplace_id");
CREATE INDEX "idx_coupons_codigo" ON "coupons"("codigo");
CREATE INDEX "idx_coupons_validade" ON "coupons"("data_inicio", "data_fim");
CREATE INDEX "idx_coupon_products_product" ON "coupon_products"("product_id");
CREATE INDEX "idx_coupon_categories_category" ON "coupon_categories"("category_id");
CREATE INDEX "idx_seo_pages_slug" ON "seo_pages"("slug");
CREATE INDEX "idx_seo_pages_status" ON "seo_pages"("status");
CREATE INDEX "idx_seo_pages_tipo" ON "seo_pages"("tipo");
CREATE INDEX "idx_seo_keywords_termo" ON "seo_keywords"("termo");
CREATE INDEX "idx_seo_keywords_intencao" ON "seo_keywords"("intencao");
CREATE INDEX "idx_product_opportunities_product" ON "product_opportunities"("product_id");
CREATE INDEX "idx_product_opportunities_score" ON "product_opportunities"("score_id");
CREATE INDEX "idx_product_opportunities_status" ON "product_opportunities"("status");

ALTER TABLE "price_history" ADD CONSTRAINT "price_history_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "price_history" ADD CONSTRAINT "price_history_marketplace_id_fkey" FOREIGN KEY ("marketplace_id") REFERENCES "Marketplace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "offer_scores" ADD CONSTRAINT "offer_scores_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_marketplace_id_fkey" FOREIGN KEY ("marketplace_id") REFERENCES "Marketplace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupon_products" ADD CONSTRAINT "coupon_products_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coupon_categories" ADD CONSTRAINT "coupon_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "seo_pages" ADD CONSTRAINT "seo_pages_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "seo_pages" ADD CONSTRAINT "seo_pages_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "seo_pages" ADD CONSTRAINT "seo_pages_marketplace_id_fkey" FOREIGN KEY ("marketplace_id") REFERENCES "Marketplace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "product_opportunities" ADD CONSTRAINT "product_opportunities_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "product_opportunities" ADD CONSTRAINT "product_opportunities_score_id_fkey" FOREIGN KEY ("score_id") REFERENCES "offer_scores"("id") ON DELETE SET NULL ON UPDATE CASCADE;
