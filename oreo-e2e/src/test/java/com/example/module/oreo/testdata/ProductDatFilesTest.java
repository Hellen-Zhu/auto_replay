package com.example.module.oreo.testdata;

import org.junit.Test;

import java.util.List;

import static com.example.module.oreo.testdata.ProductDatFiles.FX_TRF;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

/** Properties of the registry that hold whatever products and capabilities it lists: onboarding edits no test. */
public class ProductDatFilesTest {

    @Test
    public void withHasExactlyTheProductsOfTheCapability() {
        for (Capability c : Capability.values()) {
            for (ProductDatFiles p : ProductDatFiles.values()) {
                assertEquals(c + " / " + p, p.capabilities().contains(c), ProductDatFiles.with(c).contains(p));
            }
        }
    }

    @Test
    public void withKeepsRegistryOrder() {
        for (Capability c : Capability.values()) {
            List<ProductDatFiles> products = ProductDatFiles.with(c);
            for (int i = 1; i < products.size(); i++) {
                assertTrue(c + ": " + products, products.get(i - 1).ordinal() < products.get(i).ordinal());
            }
        }
    }

    @Test
    public void everyProductWithACapabilityHasItsDatFile() {
        for (ProductDatFiles p : ProductDatFiles.values()) {
            if (p.capabilities().isEmpty()) continue;
            assertNotNull(p + " has capabilities but no dat file " + p.path(),
                    Thread.currentThread().getContextClassLoader().getResource(p.path()));
        }
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
