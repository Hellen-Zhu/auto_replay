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
        assertEquals(List.of("create", "stepInFull", "stepInPartial", "earlyTermination"),
                Arrays.stream(Capability.values()).map(Capability::tagName).toList());
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
