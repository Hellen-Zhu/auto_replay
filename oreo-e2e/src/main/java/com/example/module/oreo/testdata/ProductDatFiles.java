package com.example.module.oreo.testdata;


public enum ProductDatFiles {

    /** FX Total Return Forward — uses the standard TRF .dat template. */
    FX_TRF("data/FX_TRF.dat"),

    /** CorrOption (FX Correlation Option). */
    FX_CO("data/FX_CO.dat"),

    /** FX Floating Strike Barrier. */
    FX_FSB("data/FX_FSB.dat"),

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
