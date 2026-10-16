package com.example.module.oreo.testdata;

import com.example.module.oreo.testdata.Products;

/**
 * The dat file a product's trade is created from (ProductDatFiles in the E2E project): {@code <PRODUCT ID>.dat} in
 * {@code oreo.datDir} (default {@code src/test/resources/data}), the product ID from {@link Products}.
 */
public final class DatFiles {

    private DatFiles() {
    }

    public static String forProduct(String product) {
        String id = Products.productId(product);
        return System.getProperty("oreo.datDir", "src/test/resources/data") + "/" + id + ".dat";
    }
}
