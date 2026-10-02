# ROP Playground

Learn **return-oriented programming (ROP)** by building gadget chains and
stepping through them on a toy x86-64 machine. Everything is simulated in the
browser with made-up addresses — no real binary, no shellcode, nothing touches
your machine.

## Use it

**https://jokajak.github.io/playground/ropplayground/**

## How to run locally

It's a single `index.html` with no dependencies, so you can open it directly
or serve it like the other utilities:

```sh
cd ropplayground
python3 -m http.server 8000
# then visit http://localhost:8000/
```

## How to use

The page has three tabs:

1. **Learn** — why ROP exists (NX/DEP stops injected code from running, so
   attackers reuse code already in the program), how `ret` acts like
   `pop rip`, what gadgets are, the x86-64 System V calling convention, and an
   annotated stack diagram for a `win(0xdeadbeef)` chain.
2. **Simulator** — add gadgets (`pop rdi ; ret`, `mov [rdi], rsi ; ret`,
   `syscall ; ret`, …) and raw data slots to a chain. Data slots take hex,
   decimal, or the labels `&win` / `&print`. **Step** runs one gadget at a time
   and highlights the registers that changed; **Run** executes the whole chain.
   It starts loaded with the Learn tab's worked example.
3. **Challenges** — four graded puzzles, each with a hint and a worked
   solution:
   - Set one argument (`rdi`)
   - Set two arguments (`rdi` and `rsi`)
   - Write-what-where (store a value in memory, then call)
   - Build an `execve`-style syscall (`rax`, `rdi`, `rsi`, `rdx`, then
     `syscall`)

### Simulation notes

- A chain that runs off the end of the stack, or returns into an address with
  no gadget, halts with an error, as a real process would crash.
- `syscall` ends the chain: a successful `execve` never returns. The syscall
  challenge checks the registers as they were when `syscall` ran.
- Real-world ROP adds work this tool leaves out: finding gadgets
  (ROPgadget, ropper), defeating ASLR with an info leak, stack canaries, and
  byte constraints such as no null bytes and stack alignment. The Learn tab covers these briefly.

## License

Apache-2.0 (see [LICENSE](LICENSE)).
