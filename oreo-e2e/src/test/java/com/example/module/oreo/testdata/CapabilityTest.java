package com.example.module.oreo.testdata;

import org.junit.Test;

import java.util.Arrays;
import java.util.List;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

public class CapabilityTest {

    @Test
    public void tagNamesFollowThePlaywrightRegistry() {
        assertEquals("create", Capability.CREATE.tagName());
        assertEquals("stepInFull", Capability.STEP_IN_FULL.tagName());
        assertEquals("stepInPartial", Capability.STEP_IN_PARTIAL.tagName());
        assertEquals("earlyTermination", Capability.EARLY_TERMINATION.tagName());
    }

    @Test
    public void tagNamesAreDistinctLowerCamelCase() {
        List<String> names = Arrays.stream(Capability.values()).map(Capability::tagName).toList();
        assertEquals(names.size(), names.stream().distinct().count());
        names.forEach(n -> assertTrue(n, n.matches("[a-z][A-Za-z0-9]*")));
    }

    @Test
    public void fromTagNameFindsEachConstant() {
        for (Capability c : Capability.values()) {
            assertEquals(c, Capability.fromTagName(c.tagName()));
        }
    }

    @Test
    public void unknownTagNameListsTheKnownNames() {
        try {
            Capability.fromTagName("Create");
            fail("expected an IllegalArgumentException");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage(), e.getMessage().contains("'Create' is not a capability"));
            assertTrue(e.getMessage(), e.getMessage().contains("create, stepInFull, stepInPartial, earlyTermination"));
        }
    }
}
