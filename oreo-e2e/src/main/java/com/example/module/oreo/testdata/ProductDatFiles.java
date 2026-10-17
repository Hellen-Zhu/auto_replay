package com.example.module.oreo.testdata;

import java.util.Arrays;
import java.util.Collections;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;

import static com.example.module.oreo.testdata.Capability.CREATE;
import static com.example.module.oreo.testdata.Capability.EARLY_TERMINATION;
import static com.example.module.oreo.testdata.Capability.STEP_IN_FULL;
import static com.example.module.oreo.testdata.Capability.STEP_IN_PARTIAL;

/**
 * The product registry: each product's dat file and the capabilities it supports.
 *
 * <h3>Adding a new product type</h3>
 * <ol>
 *   <li>Add the corresponding {@code .dat} file under {@code src/test/resources/data/}</li>
 *   <li>Add a new enum constant here pointing to that file, with the capabilities the product supports (the order
 *       of the constants is the order of the {@code Examples} rows; never put one first)</li>
 *   <li>Run {@code mvn test -Dtest=SyncProductExamples -Doreo.sync=all}: it writes the product into the
 *       {@code Examples} of every Outline tagged with one of its capabilities</li>
 *   <li>Review {@code git diff}</li>
 * </ol>
 */
public enum ProductDatFiles {

    /** FX Total Return Forward — uses the standard TRF .dat template. */
    FX_TRF("data/FX_TRF.dat", CREATE, STEP_IN_FULL, STEP_IN_PARTIAL, EARLY_TERMINATION),

    /** CorrOption (FX Correlation Option). */
    FX_PSCRIPT("data/FX_PSCRIPT.dat", CREATE, STEP_IN_FULL, STEP_IN_PARTIAL, EARLY_TERMINATION),

    /** FX Floating Strike Barrier. */
    FX_PSCRIPT_FSKO("data/FX_PSCRIPT_FSKO.dat", CREATE, STEP_IN_FULL, STEP_IN_PARTIAL, EARLY_TERMINATION),

    /** TRF Generic product — uses dedicated FX_PSCRIPT_TRF template. */
    FX_PSCRIPT_TRF("data/FX_PSCRIPT_TRF.dat", CREATE, STEP_IN_FULL, STEP_IN_PARTIAL, EARLY_TERMINATION),

    /** Placeholder for FX Option — replace path when .dat template is available. Supports nothing yet. */
    FX_OPT("data/fx-opt.dat");

    private final String classpathPath;
    private final Set<Capability> capabilities;

    ProductDatFiles(String classpathPath, Capability... capabilities) {
        this.classpathPath = classpathPath;
        EnumSet<Capability> set = EnumSet.noneOf(Capability.class);
        set.addAll(Arrays.asList(capabilities));
        this.capabilities = Collections.unmodifiableSet(set);
    }

    /**
     * Classpath-relative path to the {@code .dat} file for this product type,
     * suitable for {@code getClassLoader().getResource(path)}.
     */
    public String path() {
        return classpathPath;
    }

    /** The capabilities this product supports (unmodifiable). */
    public Set<Capability> capabilities() {
        return capabilities;
    }

    /** The products that support {@code capability}, in registry order: the rows of its Outlines' {@code Examples}. */
    public static List<ProductDatFiles> with(Capability capability) {
        return Arrays.stream(values()).filter(p -> p.capabilities.contains(capability)).toList();
    }
}
