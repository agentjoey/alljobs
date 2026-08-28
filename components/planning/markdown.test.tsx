import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { InlineMarkdown, Markdown } from "./markdown";

describe("InlineMarkdown", () => {
  it("renders bold, code, and links", () => {
    const { container } = render(
      <InlineMarkdown text={"Ship **bold** work with `parseDoc()` — see [docs](https://example.com/docs)."} />
    );

    const strong = container.querySelector("strong");
    expect(strong).not.toBeNull();
    expect(strong).toHaveTextContent("bold");

    const code = container.querySelector("code");
    expect(code).not.toBeNull();
    expect(code).toHaveTextContent("parseDoc()");

    const link = screen.getByRole("link", { name: "docs" });
    expect(link).toHaveAttribute("href", "https://example.com/docs");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders javascript: links as plain text (no anchor element)", () => {
    const { container } = render(
      <InlineMarkdown text={"click [here](javascript:alert(1)) now"} />
    );

    expect(container.querySelector("a")).toBeNull();
    expect(container.textContent).toContain("[here](javascript:alert(1))");
  });

  it("renders unmatched ** literally", () => {
    const { container } = render(<InlineMarkdown text={"a **stray star"} />);

    expect(container.querySelector("strong")).toBeNull();
    expect(container.textContent).toBe("a **stray star");
  });
});

describe("Markdown", () => {
  it("renders bullet lists as <ul>/<li>", () => {
    const { container } = render(
      <Markdown text={"Intro paragraph.\n\n- first **item**\n- second item"} />
    );

    const ul = container.querySelector("ul");
    expect(ul).not.toBeNull();
    const items = container.querySelectorAll("li");
    expect(items).toHaveLength(2);
    expect(items[0].querySelector("strong")).toHaveTextContent("item");
    expect(screen.getByText("Intro paragraph.")).toBeInTheDocument();
  });

  it("renders ### headings as styled strong-level headings", () => {
    const { container } = render(<Markdown text={"### Scope\n\nBody text."} />);

    const heading = container.querySelector(".md-body__h3");
    expect(heading).not.toBeNull();
    expect(heading).toHaveTextContent("Scope");
  });

  it("never throws on weird input", () => {
    expect(() =>
      render(<Markdown text={"**unclosed\n`unclosed\n[broken](\n- \n####"} />)
    ).not.toThrow();
  });
});
