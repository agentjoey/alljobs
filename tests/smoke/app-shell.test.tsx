import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import HomePage from "@/app/page";

it("names the new planning product without legacy surfaces", async () => {
  render(await HomePage());
  expect(screen.getByRole("heading", { name: /workbench|planning/i })).toBeInTheDocument();
  expect(screen.queryByText(/working ledger|apple hig|quick add/i)).not.toBeInTheDocument();
});
