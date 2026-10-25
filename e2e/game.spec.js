import { expect, test } from "@playwright/test";
import {
  approve,
  openAdmin,
  openUser,
  registerTeam,
  uniqueName,
} from "./helpers.js";

test("a full round: register, approve, buzz, reset", async ({ context }) => {
  const teamName = uniqueName("Owls");
  const { page: user } = await openUser(context);
  const { page: admin } = await openAdmin(context);

  await registerTeam(user, teamName);
  await approve(admin, teamName);

  const buzzer = user.getByRole("button", { name: "BUZZ!" });
  await expect(user.locator("#teamNameDisplay")).toHaveText(teamName);
  await expect(buzzer).toBeEnabled();

  const main = await context.newPage();
  await main.goto("/main");
  await main.getByRole("button", { name: "Start main screen" }).click();
  const result = main.getByRole("status");
  await expect(result).toHaveText("Waiting for buzzer press...");

  await buzzer.click();
  await expect(result).toHaveText(teamName);
  await expect(main.locator(".pressItem")).toHaveCount(1);
  await expect(main.locator(".pressItem")).toContainText(teamName);
  await expect(buzzer).toBeDisabled();

  await admin.getByRole("button", { name: "Reset Buzzer" }).click();
  await expect(result).toHaveText("Waiting for buzzer press...");
  await expect(main.locator(".pressItem")).toHaveCount(0);
  await expect(buzzer).toBeEnabled();
});
