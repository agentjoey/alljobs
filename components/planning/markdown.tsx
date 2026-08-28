import React from "react";

/**
 * Minimal, dependency-free Markdown renderer for planning content.
 *
 * Renders a safe subset (bold, inline code, links, bullet lists, small
 * headings) as React elements — escaping is automatic, no innerHTML.
 * The parser is total: it never throws; unmatched or unsupported markup
 * renders literally.
 */

const SAFE_LINK_PROTOCOL = /^(https?:|mailto:)/i;

function renderInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let rest = text;
  let key = 0;
  // Order matters: bold, inline code, link, line break.
  const pattern = /(\*\*([^*]+)\*\*)|(`([^`]+)`)|(\[([^\]]*)\]\(([^)\s]+)\))|(\n)/;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(rest)) !== null) {
    if (m.index > 0) nodes.push(rest.slice(0, m.index));
    if (m[1] !== undefined) {
      nodes.push(<strong key={key++}>{m[2]}</strong>);
    } else if (m[3] !== undefined) {
      nodes.push(<code key={key++}>{m[4]}</code>);
    } else if (m[5] !== undefined) {
      const label = m[6];
      const href = m[7];
      if (SAFE_LINK_PROTOCOL.test(href)) {
        nodes.push(
          <a key={key++} href={href} target="_blank" rel="noopener noreferrer">
            {label}
          </a>
        );
      } else {
        // Unsafe or weird protocol: render the raw markup as plain text.
        nodes.push(m[0]);
      }
    } else if (m[8] !== undefined) {
      nodes.push(<br key={key++} />);
    }
    rest = rest.slice(m.index + m[0].length);
  }
  if (rest) nodes.push(rest);
  return nodes;
}

const LIST_ITEM = /^\s*-\s+/;
const HEADING = /^(#{3,4})\s+(.*)$/;

function renderBlocks(text: string): React.ReactNode[] {
  const blocks: React.ReactNode[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === "") {
      i++;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push(
        <div key={key++} className={heading[1] === "###" ? "md-body__h3" : "md-body__h4"}>
          <strong>{renderInline(heading[2])}</strong>
        </div>
      );
      i++;
      continue;
    }

    if (LIST_ITEM.test(line)) {
      const items: string[] = [];
      while (i < lines.length && LIST_ITEM.test(lines[i])) {
        items.push(lines[i].replace(LIST_ITEM, ""));
        i++;
      }
      blocks.push(
        <ul key={key++}>
          {items.map((item, j) => (
            <li key={j}>{renderInline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Paragraph: gather lines until a blank line, a list, or a heading.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !LIST_ITEM.test(lines[i]) &&
      !HEADING.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(<p key={key++}>{renderInline(para.join("\n"))}</p>);
  }

  return blocks;
}

/** Block-level renderer: paragraphs, `- ` bullet lists, `###`/`####` headings. */
export function Markdown({ text }: { text: string }) {
  if (!text) return null;
  return <div className="md-body">{renderBlocks(text)}</div>;
}

/** Inline-only renderer: bold, code, links, line breaks. */
export function InlineMarkdown({ text }: { text: string }) {
  if (!text) return null;
  return <>{renderInline(text)}</>;
}
