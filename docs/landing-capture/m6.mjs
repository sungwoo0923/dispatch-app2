export default { mobile: true, steps: [ { run: async (pg) => { await pg.mouse.click(30, 25); }, shot: "mc-menu.png", after: 2500 } ] };
