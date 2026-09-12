export function yieldToMain(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0))
}

export function createBudget(milliseconds: number) {
  let deadline = performance.now() + milliseconds
  return async () => {
    if (performance.now() < deadline) return
    await yieldToMain()
    deadline = performance.now() + milliseconds
  }
}
