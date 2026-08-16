export function stabilizeMarkdown(content: string, streaming: boolean): string {
  if (!streaming) {
    return content
  }

  const fenceCount = content.split("```").length - 1

  if (fenceCount % 2 === 1) {
    return `${content}\n\`\`\``
  }

  return content
}
