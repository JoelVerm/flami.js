flami(() => html`
    <h1 onclick=${update}>
        ${() => (new Date()).toTimeString()}
    </h1>
    <h2>got foo from server: ${foo}</h2>
`)
