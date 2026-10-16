package com.example.module.oreo.testdata;

/**
 *
 * <h3>Adding a new product type</h3>
 * <ol>
 *   <li>Add the corresponding {@code .dat} file under {@code src/test/resources/data/}</li>
 *   <li>Add a new enum constant here pointing to that file</li>
 *   <li>Add a new {@code @When} step in {@code NewTradeSteps} for the product</li>
 * </ol>
 */
public enum ProductDatFiles {

    /** FX Total Return Forward — uses the standard TRF .dat template. */
    FX_TRF("data/FX_TRF.dat"),

    /** CorrOption (FX Correlation Option). */
    FX_PSCRIPT("data/FX_PSCRIPT.dat"),

    /** FX Floating Strike Barrier. */
    FX_PSCRIPT_FSKO("data/FX_PSCRIPT_FSKO.dat"),

    /** TRF Generic product — uses dedicated FX_PSCRIPT_TRF template. */
    FX_PSCRIPT_TRF("data/FX_PSCRIPT_TRF.dat"),

    /** Placeholder for FX Option — replace path when .dat template is available. */
    FX_OPT("data/fx-opt.dat");

    private final String classpathPath;

    ProductDatFiles(String classpathPath) {
        this.classpathPath = classpathPath;
    }

    /**
     * Classpath-relative path to the {@code .dat} file for this product type,
     * suitable for {@code getClassLoader().getResource(path)}.
     */
    public String path() {
        return classpathPath;
    }
}
