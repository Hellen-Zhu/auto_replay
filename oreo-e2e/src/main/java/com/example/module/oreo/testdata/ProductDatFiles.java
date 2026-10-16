package com.example.module.oreo.testdata;

/**
 * The dat file a product's trade is created from, as ProductDatFiles in the E2E project: {@code <PRODUCT ID>.dat} in
 * {@code oreo.datDir} (default {@code src/test/resources/data}). A product name is turned into its product ID by
 * {@link Products} first (FX_FSB -> FX_PSCRIPT_FSKO).
 */
public enum ProductDatFiles {
    FX_PSCRIPT,
    FX_PSCRIPT_FSKO,
    FX_PSCRIPT_TRF,
    FX_TRF;

    public String fileName() {
        return name() + ".dat";
    }

    public String path() {
        return System.getProperty("oreo.datDir", "src/test/resources/data") + "/" + fileName();
    }

    public static String forProduct(String product) {
        return valueOf(Products.productId(product)).path();
    }
}
