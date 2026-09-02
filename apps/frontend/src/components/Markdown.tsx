import { memo } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Tailwind overrides for every element react-markdown can emit, tuned for the
 * dark assistant bubble. Defined outside the component so the object identity
 * is stable across renders.
 */
const components: Components = {
  p: ({ children }) => (
    <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
  ),

  strong: ({ children }) => (
    <strong className="font-semibold text-neutral-100">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-neutral-500 line-through">{children}</del>
  ),

  h1: ({ children }) => (
    <h1 className="mt-4 mb-2 text-base font-semibold text-neutral-100 first:mt-0">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="mt-4 mb-2 text-sm font-semibold text-neutral-100 first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="mt-3 mb-1.5 text-sm font-semibold text-neutral-200 first:mt-0">
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4 className="mt-3 mb-1.5 text-sm font-medium text-neutral-200 first:mt-0">
      {children}
    </h4>
  ),

  ul: ({ children }) => (
    <ul className="mb-2 list-disc space-y-1 pl-5 last:mb-0 marker:text-neutral-600">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 list-decimal space-y-1 pl-5 last:mb-0 marker:text-neutral-600">
      {children}
    </ol>
  ),
  li: ({ children }) => (
    // Tighten paragraphs that GFM wraps around loose list items.
    <li className="leading-relaxed [&>p]:mb-0">{children}</li>
  ),

  // Inline code. Fenced blocks reuse this and get neutralised by `pre` below,
  // which works whether or not the fence declares a language.
  code: ({ children }) => (
    <code className="rounded bg-neutral-950 px-1 py-0.5 font-mono text-[0.85em] text-neutral-200">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-2 overflow-x-auto rounded-md border border-neutral-700 bg-neutral-950 p-3 font-mono text-xs leading-relaxed last:mb-0 [&>code]:rounded-none [&>code]:bg-transparent [&>code]:p-0 [&>code]:text-[1em]">
      {children}
    </pre>
  ),

  a: ({ href, children }) => (
    <a
      className="text-blue-400 underline underline-offset-2 hover:text-blue-300"
      href={href}
      target="_blank"
      rel="noreferrer noopener"
    >
      {children}
    </a>
  ),

  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-neutral-700 pl-3 text-neutral-400 last:mb-0">
      {children}
    </blockquote>
  ),
  hr: () => <hr className="my-3 border-neutral-700" />,

  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto last:mb-0">
      <table className="w-full border-collapse text-left text-xs">
        {children}
      </table>
    </div>
  ),
  th: ({ children }) => (
    <th className="border border-neutral-700 px-2 py-1 font-semibold text-neutral-100">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="border border-neutral-700 px-2 py-1 align-top">
      {children}
    </td>
  ),

  img: ({ src, alt }) => (
    <img className="mb-2 max-w-full rounded last:mb-0" src={src} alt={alt} />
  )
};

const remarkPlugins = [remarkGfm];

/**
 * Renders assistant output as markdown. Raw HTML in the source is escaped by
 * default (no rehype-raw), so model output can't inject markup.
 */
export const Markdown = memo(function Markdown({ children }: { children: string }) {
  return (
    <div className="text-sm break-words">
      <ReactMarkdown remarkPlugins={remarkPlugins} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
});
