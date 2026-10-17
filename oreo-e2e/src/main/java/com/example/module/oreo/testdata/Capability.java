package com.example.module.oreo.testdata;

import java.util.Arrays;
import java.util.stream.Collectors;

/**
 * What a product can be tested for: one capability per scenario that not every product supports. A variation in
 * data only (a product that is always Sell) is not a capability but a {@code byProduct} value.
 *
 * <p>Each Scenario Outline with {@code <product_type>} carries one tag {@code @capability#<name>}; its
 * {@code Examples} are the products of {@link ProductDatFiles#with(Capability)}, written by
 * {@code SyncProductExamples}. The names are those of the Playwright project's registry
 * ({@code framework/products.ts}); a constant is added with the first Outline that needs it.
 */
public enum Capability {

    /** A normal trade booked. */
    CREATE("create"),
    STEP_IN_FULL("stepInFull"),
    STEP_IN_PARTIAL("stepInPartial"),
    EARLY_TERMINATION("earlyTermination");

    /** The tag of an Outline: {@code @capability#stepInFull}. */
    public static final String TAG_PREFIX = "@capability#";

    private final String tagName;

    Capability(String tagName) {
        this.tagName = tagName;
    }

    /** The name in the tag and in the Playwright project's registry: {@code stepInFull}. */
    public String tagName() {
        return tagName;
    }

    /** The capability named {@code name} (case-sensitive); fails listing the known names. */
    public static Capability fromTagName(String name) {
        for (Capability c : values()) {
            if (c.tagName.equals(name)) return c;
        }
        throw new IllegalArgumentException("'" + name + "' is not a capability; known: "
                + Arrays.stream(values()).map(Capability::tagName).collect(Collectors.joining(", ")));
    }
}
