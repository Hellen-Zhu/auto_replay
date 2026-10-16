package com.oreo.uat.support;

/**
 * The browser actions the steps need, by element key (the E2E project's element JSON names, e.g.
 * {@code new_trade.book_btn}); a key starting with {@code testId=} is a raw data-testid where no element key is known.
 * In the E2E project these are Genie's built-in steps and {@code ctx} methods ({@code clickAndWaitForResponse},
 * {@code clickWithMockedResponse}, {@code clickAndCaptureResponse}); an implementation backed by Genie replaces
 * {@link com.oreo.uat.fake.RecordingOreoUi}.
 */
public interface OreoUi {

    /** Opens a page by its path ({@code /trades}). */
    void navigate(String path);

    void click(String element);

    /** {@code type inner value ... into '<el>'}: the control inside the web component host. */
    void typeInner(String element, String value);

    /** {@code click option '<text>'}: an entry of an open dropdown ({@code role=menuitem}). */
    void clickOption(String text);

    void uploadFile(String element, String file);

    /** Opens the action menu of the row whose cell is exactly {@code rowText} (right-click). */
    void rightClickRow(String grid, String rowText);

    void assertVisible(String element);

    void assertContainsText(String element, String text);

    /** The column {@code column} of the row whose cell is exactly {@code rowText} shows {@code value}. */
    void assertCellText(String grid, String rowText, String column, String value);

    /** ToastSteps: the toast of {@code type} whose {@code field} ({@code title} / {@code description}) shows text. */
    void assertToast(String type, String field, String text);

    void clickAndWaitForResponse(String element, String urlFragment, String httpMethod);

    void clickWithMockedResponse(String element, String urlFragment, String httpMethod, int status, String body);

    /** Clicks and returns the body of the response of that request. */
    String clickAndCaptureResponse(String element, String urlFragment, String httpMethod);
}
