import { expect } from "@playwright/test";

export const ADMIN_PASSWORD = "e2e-pass";

let counter = 0;

// Teams persist for the whole run, so every test needs its own names.
export function uniqueName(base) {
  counter += 1;
  return `${base} ${Date.now().toString(36)}${counter}`;
}

// Answers prompts from a queue in order and records alert/confirm messages.
// One handler is needed because a second dialog fired right after the first
// would otherwise be auto-dismissed by Playwright.
export function handleDialogs(page) {
  const responses = [];
  const messages = [];
  page.on("dialog", async (dialog) => {
    if (dialog.type() === "beforeunload") {
      await dialog.accept();
      return;
    }
    if (dialog.type() === "prompt") {
      const response = responses.shift();
      if (response === undefined) {
        await dialog.dismiss();
      } else {
        await dialog.accept(response);
      }
      return;
    }
    messages.push(dialog.message());
    await dialog.accept();
  });
  return {
    messages,
    respond(...values) {
      responses.push(...values);
    },
  };
}

export async function openUser(context) {
  const page = await context.newPage();
  const dialogs = handleDialogs(page);
  await page.goto("/");
  return { page, dialogs };
}

// The form only appears once the socket has connected, which registration
// needs so the server can notify this page on approval.
export async function registerTeam(page, teamName) {
  await expect(page.locator("#registrationForm")).toBeVisible();
  await page.getByLabel("Name", { exact: true }).fill(teamName);
  await page.getByRole("button", { name: "Register" }).click();
}

export async function openAdmin(context) {
  const page = await context.newPage();
  const dialogs = handleDialogs(page);
  await page.goto("/admin");
  await page.getByLabel("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Login" }).click();
  await expect(page.getByRole("heading", { name: "Admin Panel" })).toBeVisible();
  return { page, dialogs };
}

export function teamRow(adminPage, teamName) {
  return adminPage.locator(".userItem").filter({ hasText: teamName });
}

export async function approve(adminPage, teamName) {
  await teamRow(adminPage, teamName)
    .getByRole("button", { name: "Approve", exact: true })
    .click();
}
