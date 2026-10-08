# Element locators

A copy of `src/test/resources/elements` of the Java + Cucumber E2E project (`pages/` and `components/`), so that a locator is maintained in one place only.

- **Do not edit these files here.** Change the element in the E2E project, then refresh this folder:

  ```bash
  npm run sync:elements -- "C:\path\to\the-e2e-project"
  ```

- A page object or component uses an element by its name: `element('new_trade.book_btn')` (`framework/elements.ts`).
- More in the main README, "QA: element locators".
