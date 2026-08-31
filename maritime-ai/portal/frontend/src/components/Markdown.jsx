import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ChartBlock from "./ChartBlock.jsx";

function extractText(children) {
  if (typeof children === "string") return children;
  if (Array.isArray(children)) return children.map(extractText).join("");
  if (children && children.props) return extractText(children.props.children);
  return "";
}

export default function Markdown({ children }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: (props) => (
            <div className="md-tbl-wrap"><table {...props} /></div>
          ),
          a: (props) => <a {...props} target="_blank" rel="noreferrer" />,
          code: ({ inline, className, children: kids, ...props }) => {
            const lang = /language-(\w+)/.exec(className || "");
            if (!inline && lang && lang[1] === "chart") {
              return <ChartBlock spec={extractText(kids).trim()} />;
            }
            return <code className={className} {...props}>{kids}</code>;
          },
        }}
      >
        {children || ""}
      </ReactMarkdown>
    </div>
  );
}
