import { expect, test } from "@playwright/test";
import {
  approve,
  openAdmin,
  openUser,
  registerTeam,
  teamRow,
  uniqueName,
} from "./helpers.js";

test("reopening the page restores an approved team", async ({ context }) => {
  const teamName = uniqueName("Bats");
  const { page: user } = await openUser(context);
  const { page: admin } = await openAdmin(context);
  await registerTeam(user, teamName);
  await approve(admin, teamName);
  await expect(user.locator("#buzzerContainer")).toBeVisible();

  // close() skips beforeunload; localStorage is shared within the context.
  await user.close();
  const { page: reopened } = await openUser(context);
  await expect(reopened.locator("#teamNameDisplay")).toHaveText(teamName);
  await expect(reopened.getByRole("button", { name: "BUZZ!" })).toBeEnabled();
  await expect(reopened.locator("#registrationForm")).toBeHidden();
});

test("a name change is applied once the admin approves it", async ({
  context,
}) => {
  const teamName = uniqueName("Moths");
  const newName = uniqueName("Luna Moths");
  const { page: user, dialogs } = await openUser(context);
  const { page: admin } = await openAdmin(context);
  await registerTeam(user, teamName);
  await approve(admin, teamName);
  await expect(user.locator("#buzzerContainer")).toBeVisible();

  dialogs.respond(newName);
  await user.getByRole("button", { name: "Change team name" }).click();
  await expect
    .poll(() => dialogs.messages)
    .toContain("Name change request submitted for approval");

  const row = teamRow(admin, teamName);
  await expect(row).toContainText(`(${newName})`);
  await row.getByRole("button", { name: "Approve Name" }).click();

  await expect(user.locator("#teamNameDisplay")).toHaveText(newName);
  await expect(teamRow(admin, newName)).not.toContainText("(");
});

test("removing a team sends it back to registration", async ({ context }) => {
  const teamName = uniqueName("Rats");
  const { page: user } = await openUser(context);
  const { page: admin } = await openAdmin(context);
  await registerTeam(user, teamName);
  await approve(admin, teamName);
  await expect(user.locator("#buzzerContainer")).toBeVisible();

  await teamRow(admin, teamName).getByRole("button", { name: "Remove" }).click();

  await expect(user.locator("#registrationForm")).toBeVisible();
  await expect(user.getByLabel("Name", { exact: true })).toHaveValue(teamName);
  await expect(user.getByLabel("Name", { exact: true })).toBeEnabled();
  await expect(teamRow(admin, teamName)).toHaveCount(0);
});

test("a duplicate name is rejected", async ({ context }) => {
  const teamName = uniqueName("Crows");
  const { page: first } = await openUser(context);
  await registerTeam(first, teamName);

  // A separate context has its own localStorage, like a second phone.
  const other = await context.browser().newContext();
  const { page: second, dialogs } = await openUser(other);
  await registerTeam(second, teamName);
  await expect
    .poll(() => dialogs.messages)
    .toContain("Registration failed: Team name already registered");
  await expect(second.getByLabel("Name", { exact: true })).toBeEnabled();
  await other.close();
});
