let lastPauseTime = new Date().getSeconds()
let time = 0
setInterval(update, 1000)
let running = false
const value = () => {
    if (running)
        return time + new Date().getSeconds() - lastPauseTime
    return time
}
const start = () => {
    running = true
    lastPauseTime = new Date().getSeconds()
}
const stop = () => {
    if (!running) return
    running = false
    time += new Date().getSeconds() - lastPauseTime
}
const reset = () => {
    if (running) stop()
    time = 0
}

export const timer = () => html`
        <div>
            <h1>${value}</h1>
            <button onClick=${start}>start</button>
            <button onClick=${stop}>stop</button>
            <button onClick=${reset}>reset</button>
        </div>
    `
