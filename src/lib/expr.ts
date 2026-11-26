// A tiny, safe arithmetic expression evaluator for answer-key formulas
// such as "L * log2(N)" or "2^(H-1) / 1e10". No eval, no property access.

type Tok = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string };

const FUNCS: Record<string, (...a: number[]) => number> = {
  log2: Math.log2,
  log10: Math.log10,
  ln: Math.log,
  sqrt: Math.sqrt,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
    if ("+-*/^(),".includes(c)) { out.push({ t: "op", v: c }); i++; continue; }
    throw new Error(`Unexpected character "${c}" in formula`);
  }
  return out;
}

/** Evaluates `src` with the given variables. Throws on syntax errors or unknown names. */
export function evaluate(src: string, vars: Record<string, number>): number {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const eat = (v?: string) => {
    const tk = toks[p];
    if (!tk || (v !== undefined && tk.v !== v)) throw new Error(`Expected "${v}" in formula`);
    p++;
    return tk;
  };

  // expr := term (('+'|'-') term)*
  function expr(): number {
    let v = term();
    while (peek()?.t === "op" && (peek().v === "+" || peek().v === "-")) {
      const op = eat().v;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  // term := unary (('*'|'/') unary)*
  function term(): number {
    let v = unary();
    while (peek()?.t === "op" && (peek().v === "*" || peek().v === "/")) {
      const op = eat().v;
      const r = unary();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  // unary := '-' unary | power
  function unary(): number {
    if (peek()?.t === "op" && peek().v === "-") { eat(); return -unary(); }
    if (peek()?.t === "op" && peek().v === "+") { eat(); return unary(); }
    return power();
  }
  // power := atom ('^' unary)?   (right associative)
  function power(): number {
    const base = atom();
    if (peek()?.t === "op" && peek().v === "^") { eat(); return Math.pow(base, unary()); }
    return base;
  }
  function atom(): number {
    const tk = peek();
    if (!tk) throw new Error("Unexpected end of formula");
    if (tk.t === "num") { p++; return tk.v; }
    if (tk.t === "id") {
      p++;
      if (peek()?.t === "op" && peek().v === "(") {
        const fn = Object.hasOwn(FUNCS, tk.v) ? FUNCS[tk.v] : undefined;
        if (!fn) throw new Error(`Unknown function "${tk.v}"`);
        eat("(");
        const args: number[] = [expr()];
        while (peek()?.t === "op" && peek().v === ",") { eat(","); args.push(expr()); }
        eat(")");
        return fn(...args);
      }
      if (tk.v === "pi") return Math.PI;
      if (!Object.hasOwn(vars, tk.v)) throw new Error(`Unknown variable "${tk.v}"`);
      return vars[tk.v];
    }
    if (tk.v === "(") { eat("("); const v = expr(); eat(")"); return v; }
    throw new Error(`Unexpected "${tk.v}" in formula`);
  }

  const v = expr();
  if (p !== toks.length) throw new Error("Unexpected text at end of formula");
  return v;
}

/** Fills "{name}" placeholders in a template with variable values. */
export function fillTemplate(tpl: string, vars: Record<string, number | string>): string {
  return tpl.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m));
}
