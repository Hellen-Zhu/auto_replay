public class TradeApiSteps {

    @Given("^set multi-part form parameter '(.+)' for product '([^']*)' from current scenario$")
    public void setMultiPartFormParameterFromCurrentScenario(String partName, String product) {
        String requestBody = ctx.get("_tc.request");
        String requestWithProductId = setBasicProductId(requestBody, product, ctx.get("_tc.key"));
        ctx.helper().request().multiPart(partName, requestWithProductId, "application/json");
        log.info("[TradeApiSteps] set multi-part form parameter '{}' from current scenario ('{}') as '{}'",
                partName, ctx.get("_tc.key"), requestWithProductId);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Multipart — dat file by product
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Attaches the dat file for the given product as the {@code datFile} multipart part.
     * The product name maps to a {@link ProductDatFiles} enum constant (case-insensitive,
     * spaces replaced with underscores).
     *
     * <p>Adding a new product requires only a new {@link ProductDatFiles} constant — no new
     * step needed.
     *
     * <pre>And set multi-part dat file for product 'FX_TRF'</pre>
     */
    @Given("^set multi-part dat file for product '([^']*)'$")
    public void setMultiPartDatFileForProduct(String product) {
        String enumName = product.trim().toUpperCase().replace(' ', '_');
        ProductDatFiles datFile;
        try {
            datFile = ProductDatFiles.valueOf(enumName);
        } catch (IllegalArgumentException e) {
            throw new AssertionError(
                    "[TradeApiSteps] Unknown product '" + product + "' — add '"
                    + enumName + "' to the ProductDatFiles enum first.");
        }
        attachDatFile(datFile.path());
    }

    // ─────────────────────────────────────────────────────────────────────
    // Private
    // ─────────────────────────────────────────────────────────────────────

    private void attachDatFile(String classpathPath) {
        ClassLoader cl = Thread.currentThread().getContextClassLoader();
        if (cl == null) cl = getClass().getClassLoader();
        URL resource = cl.getResource(classpathPath);
        if (resource == null) {
            throw new AssertionError(
                    "[TradeApiSteps] dat file '" + classpathPath + "' not found on classpath.");
        }
        try {
            ctx.helper().request().multiPart("datFile", Paths.get(resource.toURI()).toFile());
        } catch (Exception e) {
            throw new AssertionError(
                    "[TradeApiSteps] Failed to attach dat file '" + classpathPath + "': " + e.getMessage(), e);
        }
        log.info("[TradeApiSteps] attached dat file '{}'", classpathPath);
