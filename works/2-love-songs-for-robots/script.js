document.addEventListener('DOMContentLoaded', function () {
    window.counter = 0
    document.addEventListener('click', function () {
        window.counter += Math.random() * 2 + 1
        type()
    })
})

const poem = `I have a short lifespan <br>
my body consumes electric <br>
through my mechanical dreams<br>
do you get me? -tick-<br>
<br>
when I try to think at night<br>
my chips getting hot<br>
I make noises, yet<br>
I still stick! <br>
<br>
<br>
do you hear my sound<br>
by putting your hands<br>
on my sensors, wicked?<br>
<br>
<br>
do you feed me<br>
by replacing my<br>
tiny batteries?<br>
<br>`



const type = () => {
    if (window.counter === poem.length - 1) {
        window.counter = 0
    }
    const content = document.querySelector('#Container p');
    content.innerHTML = poem.slice(0, window.counter) + "_"
}
