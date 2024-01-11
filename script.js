window.onload = function () {
  const textContainer = document.getElementById('animatedText');
  let newHTML = '';
  for (let letter of textContainer.innerText) {
    if (letter === ' ') {
      newHTML += '<span class="animate" style="white-space: pre;"> </span>';
    } else {
      newHTML += `<span class="animate">${letter}</span>`;
    }
  }
  textContainer.innerHTML = newHTML;

  document.querySelectorAll('.animate').forEach(letter => {
    letter.onmouseover = () => {
      const xMove = Math.random() * 40 - 20; // Random movement in X
      const yMove = Math.random() * 40 - 20; // Random movement in Y
      letter.style.setProperty('--x-move', `${xMove}px`);
      letter.style.setProperty('--y-move', `${yMove}px`);
    };

    letter.onmousedown = () => {
      letter.classList.toggle('clicked')
    }
  });
};

