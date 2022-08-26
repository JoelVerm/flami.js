import {timer} from '../components/timer.js'

const inp = () => html`<input type="text" onchange=${e => console.log(e.target.value)}></input>`

flami(() => html`
    <h1 onclick=${update}>
        ${() => Date.now()}
    </h1>
    ${inp()}
    ${timer()}
`)
