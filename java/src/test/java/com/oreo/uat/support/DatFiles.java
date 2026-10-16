package com.oreo.uat.support;

import com.oreo.uat.testdata.Products;

/**
 * The dat file a product's trade is created from (ProductDatFiles in the E2E project): {@code dat/<PRODUCT ID>/<PRODUCT
 * ID>.dat} under {@code oreo.datDir} (default {@code src/test/resources}), the product ID from {@link Products}.
 */
public final class DatFiles {

    private DatFiles() {
    }

    public static String forProduct(String product) {
        String id = Products.productId(product);
        return System.getProperty("oreo.datDir", "src/test/resources") + "/dat/" + id + "/" + id + ".dat";
    }
}
