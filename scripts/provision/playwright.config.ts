// The Playwright config of scripts/provision/: the project's own, for the one test in this folder.
import { defineConfig } from '@playwright/test';
import base from '../../playwright.config';

export default defineConfig({ ...base, testDir: '.', reporter: 'list' });
