package com.oreo.uat.testdata;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Product registry: the product names a case ID or an Examples table may use, and the product ID the system knows
 * them by. The only place the old names are mapped (FX_CO = FX_PSCRIPT, FX_FSB = FX_PSCRIPT_FSKO): no data file
 * repeats a product ID.
 */
public final class Products {

    private static final Map<String, String> PRODUCT_ID = new LinkedHashMap<>();

    static {
        PRODUCT_ID.put("FX_TRF", "FX_TRF");
        PRODUCT_ID.put("FX_PSCRIPT", "FX_PSCRIPT");
        PRODUCT_ID.put("FX_PSCRIPT_FSKO", "FX_PSCRIPT_FSKO");
        // Old names, still used in feature files and case IDs
        PRODUCT_ID.put("FX_CO", "FX_PSCRIPT");
        PRODUCT_ID.put("FX_FSB", "FX_PSCRIPT_FSKO");
    }

    private Products() {
    }

    public static boolean isKnown(String product) {
        return PRODUCT_ID.containsKey(product);
    }

    /** The product ID the system knows a product by; fails for a product that is not registered. */
    public static String productId(String product) {
        String id = PRODUCT_ID.get(product);
        if (id == null) {
            throw new AssertionError("Unknown product '" + product + "': add it to " + Products.class.getName());
        }
        return id;
    }
}
