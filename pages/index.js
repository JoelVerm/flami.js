import {timer} from '../components/timer.js'

const inp = () => {
    return html`<input type="text" onchange=${e => console.log(e.target.value)}></input>`
}

flami`
    <h1 onclick=${update}>
        ${() => Date.now()}
    </h1>
    ${inp()}
    ${timer()}
`
