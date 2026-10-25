import { expect, test } from "@playwright/test";
import {
  approve,
  handleDialogs,
  openAdmin,
  openUser,
  registerTeam,
  teamRow,
  uniqueName,
} from "./helpers.js";

test("a wrong password keeps the panel hidden", async ({ page }) => {
  const dialogs = handleDialogs(page);
  await page.goto("/admin");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: "Login" }).click();
  await expect.poll(() => dialogs.messages).toContain("Invalid password");
  await expect(page.locator("#adminPanel")).toBeHidden();
});

test("editing a team updates the player's screen", async ({ context }) => {
  const teamName = uniqueName("Wolves");
  const newName = uniqueName("Werewolves");
  const { page: user } = await openUser(context);
  const { page: admin, dialogs } = await openAdmin(context);
  await registerTeam(user, teamName);
  await approve(admin, teamName);

  dialogs.respond(newName, "Table 9");
  await teamRow(admin, teamName).getByRole("button", { name: "Edit" }).click();

  await expect(user.locator("#teamNameDisplay")).toHaveText(newName);
  await expect(user.locator("#teamDescriptionContainer")).toHaveText("Table 9");
  await expect(teamRow(admin, newName)).toContainText("Table 9");
});

test("team names are rendered as text, not HTML", async ({ context }) => {
  const teamName = uniqueName(`<b>"x'</b>`);
  const { page: user } = await openUser(context);
  const { page: admin } = await openAdmin(context);
  await registerTeam(user, teamName);

  const row = teamRow(admin, teamName);
  await expect(row).toContainText(teamName);
  await expect(row.locator("b")).toHaveCount(0);

  // The name round-trips through data attributes, so approving still works.
  await approve(admin, teamName);
  await expect(user.locator("#teamNameDisplay")).toHaveText(teamName);
});
