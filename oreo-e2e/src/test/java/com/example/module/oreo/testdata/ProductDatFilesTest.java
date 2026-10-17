package com.example.module.oreo.testdata;

import org.junit.Test;

import java.util.List;

import static com.example.module.oreo.testdata.ProductDatFiles.FX_OPT;
import static com.example.module.oreo.testdata.ProductDatFiles.FX_PSCRIPT;
import static com.example.module.oreo.testdata.ProductDatFiles.FX_PSCRIPT_FSKO;
import static com.example.module.oreo.testdata.ProductDatFiles.FX_PSCRIPT_TRF;
import static com.example.module.oreo.testdata.ProductDatFiles.FX_TRF;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

public class ProductDatFilesTest {

    private static final List<ProductDatFiles> FOUR = List.of(FX_TRF, FX_PSCRIPT, FX_PSCRIPT_FSKO, FX_PSCRIPT_TRF);

    @Test
    public void withKeepsRegistryOrder() {
        assertEquals(FOUR, ProductDatFiles.with(Capability.CREATE));
    }

    @Test
    public void everyCapabilityHasTheFourProductsToday() {
        for (Capability c : Capability.values()) {
            assertEquals(c.tagName(), FOUR, ProductDatFiles.with(c));
        }
    }

    @Test
    public void fxOptSupportsNothing() {
        assertTrue(FX_OPT.capabilities().isEmpty());
    }

    @Test(expected = UnsupportedOperationException.class)
    public void capabilitiesAreUnmodifiable() {
        FX_TRF.capabilities().add(Capability.CREATE);
    }

    @Test
    public void fxTrfStaysFirst() {
        assertEquals(FX_TRF, ProductDatFiles.values()[0]);
    }
}
