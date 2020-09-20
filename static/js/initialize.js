// Work out min width according to aspect ratio of viewport
function setMinWidth() {
  document.body.style.minWidth = `${1223 * window.innerWidth / window.innerHeight}px`;
}
setMinWidth();
window.addEventListener('resize', setMinWidth);

// Set up draggables
var counters = Array.from(document.querySelectorAll('.counter'));
var counterSpaces = Array.from(document.querySelectorAll('.counter-space'));
var container = document.querySelector('.container');
var snapTargets = counterSpaces.map((counterSpace, index) => ({x: 1237, y: 816 + (index * 70), center: true}));
var initialCountersState = [
  {'left': 1217, 'top': 796, 'colour': 'purple'},
  {'left': 1217, 'top': 866, 'colour': 'red'},
  {'left': 1217, 'top': 936, 'colour': 'yellow'},
  {'left': 1217, 'top': 1006, 'colour': 'green'},
  {'left': 1217, 'top': 1076, 'colour': 'blue'},
  {'left': 1217, 'top': 1146, 'colour': 'black'}
];
var dice = Array.from(document.querySelectorAll('.dice'));
var twoDiceButton = document.querySelector('.btn.two-dice');
var oneDiceButton = document.querySelector('.btn.one-dice');
var boardSquareRects = Array
  .from(document.querySelectorAll('.corner-square:not(.allow-multiple), .outside-square, .interior-square:not(.inactive)'))
  .map(square => {
    var rect = square.getBoundingClientRect();
    return {left: rect.left + scrollX, right: rect.right + scrollX, top: rect.top + scrollY, bottom: rect.bottom + scrollY};
  });

// Set up SocketIO connection
var socket = io.connect(location.protocol + '//' + document.domain + ':' + location.port + '/sync');

// Functions to emit SocketIO events
function emitCounterMove(index) {
  socket.emit('counterMove', {
    data: {sid: socket.id, counter: index, left: draggables[index].left, top: draggables[index].top}
  });
}

function emitCounterSelect(index) {
  socket.emit('counterSelect', {
    data: {sid: socket.id, counter: index}
  });
}

function emitCounterUnselect(index) {
  socket.emit('counterUnselect', {
    data: {sid: socket.id, counter: index}
  });
}

function emitCounterReset(index) {
  socket.emit('counterReset', {
    data: {counter: index}
  });
}

function emitCounterMoveSmoothly(index, x, y) {
  socket.emit('counterMoveSmoothly', {
    data: {sid: socket.id, counter: index, left: x, top: y}
  });
}

function emitDiceRoll(both) {
  socket.emit('diceRoll', {
    data: {sid: socket.id, both: both}
  });
}

function emitGetAllOppCards() {
  socket.emit('getAllOppCards');
}

function emitGetAllExpCards() {
  socket.emit('getAllExpCards');
}

function emitGetNewOppCard() {
  socket.emit('getNewOppCard');
}

function emitGetNewExpCard() {
  socket.emit('getNewExpCard');
}

function emitUseOppCard(index) {
  socket.emit('useOppCard', {
    data: {index: index}
  });
}

function emitUseExpCard(index) {
  socket.emit('useExpCard', {
    data: {index: index}
  });
}

function emitClearOwnCards() {
  socket.emit('clearOwnCards');
}

function emitClearAllCards() {
  socket.emit('clearAllCards');
}

// Tippy tooltip functions
function hideTooltip(index) {
  counters[index]._tippy.hide();
}

function showTooltip(index) {
  counters[index]._tippy.show();
  setTimeout(function() {
    hideTooltip(index);
  }, 8000);
}

// Set up draggables
var draggables = counters.map((counter, index) => new PlainDraggable(counter, {
  containment: container,
  gravity: 10,
  snap: {targets: snapTargets},
  autoScroll: true,
  zIndex: 100,
  onDrag: function(moveTo) {
    hideTooltip(index);
    var rect = this.rect;
    var moveToRect = {left: moveTo.left, top: moveTo.top, right: moveTo.left + rect.width, bottom: moveTo.top + rect.height};
    var blockedRect = {left: 1213, top: 10, right: 1283, bottom: 790};
    if (moveToRect.right > blockedRect.left && moveToRect.top < blockedRect.bottom) {
      var possiblePositions = [{axis: 'left', value: blockedRect.left - rect.width}, {axis: 'top', value: blockedRect.bottom}];
      var closestPosition;
      possiblePositions.forEach(function(position) {
        position.distance = Math.abs(moveTo[position.axis] - position.value);
        if (!closestPosition || position.distance < closestPosition.distance)
          closestPosition = position;
      });
      moveTo[closestPosition.axis] = closestPosition.value;
    }
  },
  onMove: function() {
    hideTooltip(index);
    socket.emit('counterMove', {
      data: {sid: socket.id, counter: index, left: this.left, top: this.top}
    });
  }
}));

// Functions to handle counter selection/unselection
function applySelectionToCounter(index) {
  counters[index].classList.add('held');
}

function applyUnselectionToCounter(index) {
  counters[index].classList.remove('held');
  draggables[index].disabled = false;
}

function unselectAfterDelay(index) {
  var prevLeft = -1, prevTop = -1, currentLeft = draggables[index].left, currentTop = draggables[index].top;
  var intervalId = setInterval(function() {
    prevLeft = currentLeft;
    prevTop = currentTop;
    currentLeft = draggables[index].left;
    currentTop = draggables[index].top;
    if (currentLeft == prevLeft && currentTop == prevTop)
    {
      applyUnselectionToCounter(index);
      emitCounterUnselect(index);
      clearInterval(intervalId);
    }
  }, 5000);
  socket.on('counterUnselect', function() {
    clearInterval(intervalId);
  });
}

function unselectCounter(index) {
  if (!draggables[index].disabled) {
    emitCounterUnselect(index);
    applyUnselectionToCounter(index);
    showTooltipsForCountersToDisplace(index);
  }
}

function selectCounter(index) {
  if (!draggables[index].disabled) {
    emitCounterSelect(index);
    applySelectionToCounter(index);
    unselectAfterDelay(index);
  }
}

// Disable counters that are currently held when arriving on page
draggables.forEach((draggable, index) => {
  draggable.disabled = counters[index].classList.contains('held');
  unselectAfterDelay(index);
});

// Event listeners for selection events (multiple devices)
['mousedown', 'touchstart'].forEach(eventType => {
  counters.forEach((counter, index) => {
    counter.addEventListener(eventType, () => { selectCounter(index); });
  });
});
['mouseup', 'touchend'].forEach(eventType => {
  document.addEventListener(eventType, () => {
    counters.forEach((counter, index) => {
      if (counters[index].classList.contains('held'))
        unselectCounter(index);
    });
  });
});

// Event listeners and functions for dice rolls
twoDiceButton.addEventListener('click', function() {
  emitDiceRoll(true);
});
oneDiceButton.addEventListener('click', function() {
  emitDiceRoll(false);
});

function enableDisableDice(both, newStateIsDisabled) {
  if (both)
    twoDiceButton.disabled = newStateIsDisabled;
  else
    oneDiceButton.disabled = newStateIsDisabled;
}

// SocketIO message validation
function hasValidCounterAndSID(msg) {
  return (msg && typeof msg == 'object' && 
    msg.hasOwnProperty('data') && msg.data && typeof msg.data == 'object' && 
    msg.data.hasOwnProperty('sid') && msg.data.sid != socket.id && 
    msg.data.hasOwnProperty('counter') && typeof msg.data.counter == 'number' && 
    msg.data.counter >= 0 && msg.data.counter < draggables.length);
}

function hasValidPosition(msg) {
  return (msg && typeof msg == 'object' && 
    msg.hasOwnProperty('data') && msg.data && typeof msg.data == 'object' && 
    msg.data.hasOwnProperty('left') && typeof msg.data.left == 'number' && msg.data.left >= 0 &&
    msg.data.hasOwnProperty('top') && typeof msg.data.top == 'number' && msg.data.top >= 0 && 
    Math.round(msg.data.left) <= 1223 && Math.round(msg.data.top) <= 1153 && 
    (Math.round(msg.data.left) <= 1153 || Math.round(msg.data.top) >= 790 || 
    (msg.data.hasOwnProperty('onPath') && msg.data.onPath)));
}

function hasValidDiceSelector(msg) {
  return (msg && typeof msg == 'object' && 
    msg.hasOwnProperty('data') && msg.data && typeof msg.data == 'object' &&
    msg.data.hasOwnProperty('both') && typeof msg.data.both == 'boolean');
}

function hasValidDiceState(msg) {
  return (hasValidDiceSelector(msg) && msg.data.hasOwnProperty('dice1') && Array.isArray(msg.data.dice1) &&
    ((msg.data.hasOwnProperty('dice2') && Array.isArray(msg.data.dice2)) || msg.data.both == false));
}

function hasValidCardIndices(msg) {
  return (msg && typeof msg == 'object' && 
    msg.hasOwnProperty('data') && msg.data && typeof msg.data == 'object' &&
    msg.data.hasOwnProperty('cardIndices') && Array.isArray(msg.data.cardIndices));
}

function hasValidCardIndex(msg) {
  return (msg && typeof msg == 'object' && 
    msg.hasOwnProperty('data') && msg.data && typeof msg.data == 'object' &&
    msg.data.hasOwnProperty('index') && typeof msg.data.index == 'number' &&
    msg.data.index >= 0 && msg.data.index < 28);
}

function hasValidCardCount(msg) {
  return (msg && typeof msg == 'object' && 
    msg.hasOwnProperty('data') && msg.data && typeof msg.data == 'object' &&
    msg.data.hasOwnProperty('count') && typeof msg.data.count == 'number' &&
    msg.data.count >= 0 && msg.data.count <= 28);
}

// Event listeners for SocketIO events
socket.on('counterSelect', function(msg) {
  if (hasValidCounterAndSID(msg)) {
    hideTooltip(msg.data.counter);
    applySelectionToCounter(msg.data.counter);
    draggables[msg.data.counter].disabled = true;
    unselectAfterDelay(msg.data.counter);
  }
});
socket.on('counterUnselect', function(msg) {
  if (hasValidCounterAndSID(msg)) {
    applyUnselectionToCounter(msg.data.counter);
  }
});
socket.on('counterMove', function(msg) {
  if (hasValidCounterAndSID(msg) && hasValidPosition(msg)) {
    hideTooltip(msg.data.counter);
    draggables[msg.data.counter].left = msg.data.left;
    draggables[msg.data.counter].top = msg.data.top;
  }
});
socket.on('diceDisable', function(msg) {
  if (hasValidDiceSelector(msg)) {
    enableDisableDice(msg.data.both, true);
  }
});
socket.on('diceEnable', function(msg) {
  if (hasValidDiceSelector(msg)) {
    enableDisableDice(msg.data.both, false);
  }
});
socket.on('diceUpdate', function(msg) {
  if (hasValidDiceState(msg)) {
    enableDisableDice(msg.data.both, true);
    for (let i = 0; i < 12; i++) {
      setTimeout(function() {
        if (msg.data.both) {
          dice[0].classList = `dice ${msg.data.dice1[i]}`;
          dice[1].classList = `dice ${msg.data.dice2[i]}`;
        }
        else
          dice[2].classList = `dice ${msg.data.dice1[i]}`;
      }, (100 + i * i * 0.4) * i);
    }
    setTimeout(() => {enableDisableDice(msg.data.both, false)}, 2250);
  }
});

// Find best spot on park bench
function getDist(xDist, yDist) {
  return Math.sqrt((xDist * xDist) + (yDist * yDist));
}

function getTrueXVal(xStep) {
  return (10 + (xStep + 8) * 7.5);
}

function getTrueYVal(yStep) {
  return (10 + (yStep + 7) * 8);
}

function getMinDistFromParkBenchCounters(x, y) {
  var parkBenchCounters = draggables.filter(draggable => (draggable.left <= 190 && draggable.top <= 190));
  var minDist = Infinity;
  var currentDist;
  parkBenchCounters.forEach(counter => {
    currentDist = getDist(x - counter.left, y - counter.top);
    if (currentDist < minDist)
      minDist = currentDist;
  });
  return minDist;
}

function updateFarthestPointSoFar(xStep, yStep, currentFarthestPoint) {
  var currentX = getTrueXVal(xStep);
  var currentY = getTrueYVal(yStep);
  var minDistFromParkBenchCounters = getMinDistFromParkBenchCounters(currentX, currentY);
  if (minDistFromParkBenchCounters > currentFarthestPoint.maxDistSoFar)
  {
    currentFarthestPoint.maxDistSoFar = minDistFromParkBenchCounters;
    currentFarthestPoint.farthestX = currentX;
    currentFarthestPoint.farthestY = currentY;
  }
}

function getFarthestPoint() {
  var xStep = 0, yStep = 0, dir = 1, maxStep = 0.5;
  var currentFarthestPoint = {farthestX: undefined, farthestY: undefined, maxDistSoFar: 0};
  for (maxStep = 0.5; maxStep <= 8 && currentFarthestPoint.maxDistSoFar < 60; maxStep += 0.5) {
    while (xStep * dir < maxStep) {
      updateFarthestPointSoFar(xStep, yStep, currentFarthestPoint);
      xStep = xStep + dir;
    }
    while (yStep * dir < maxStep) {
      updateFarthestPointSoFar(xStep, yStep, currentFarthestPoint);
      yStep = yStep + dir;
    }
    dir = -1 * dir;
  }
  return {left: currentFarthestPoint.farthestX, top: currentFarthestPoint.farthestY};
}

function moveToParkBench(index) {
  var farthestPoint = getFarthestPoint();
  emitCounterMoveSmoothly(index, farthestPoint.left, farthestPoint.top);
}

// Set up tippy on counters
counters.forEach((counter, index) => {
  var colour = initialCountersState[index].colour;
  tippy(counter, {
    allowHTML: true,
    animation: 'scale',
    content: `<button class='btn' onclick='hideTooltip(${index});moveToParkBench(${index});'>\
      Send me to park bench!</button><button class='btn' onclick='hideTooltip(${index});'>Ignore</button>`,
    theme: colour,
    hideOnClick: false,
    interactive: true,
    trigger: 'manual'
  });
});

function isInsideRect(index, rect) {
  var centreX = draggables[index].rect.left + 30;
  var centreY = draggables[index].rect.top + 30;
  return (rect.left <= centreX && centreX <= rect.right && rect.top <= centreY && centreY <= rect.bottom);
}

function containingRect(counterIndex) {
  return (boardSquareRects.find(boardSquare => isInsideRect(counterIndex, boardSquare)));
}

function showTooltipsForCountersToDisplace(counterIndex) {
  var rect = containingRect(counterIndex);
  if (rect)
    counters.forEach((counter, index) => {
      if (index != counterIndex && isInsideRect(index, rect))
        showTooltip(index);
    });
}

// Opp. and exp. card contents
var oppTypes = [
  "opportunity",
  "special opportunity",
  "golden opportunity"
];
var oppDescriptions = [
  "start Farming",
  "enter University",
  "join Big Business",
  "go to Sea",
  "go to Sea on the four-masted schooner Portsmouth Pride",
  "enter Politics",
  "enter Hollywood",
  "take Bermuda Vacation",
  "join Uranium Expedition",
  "join Moon Expedition",
  "move to the entrance square of the occupation of your choice"
];
var reqDetails = [
  "meet normal requirements",
  "meet normal requirements. If all players have been to university, replace and draw again",
  "double all happiness earned on cruise",
  "because of your great hand-shaking ability, entrance expenses paid",
  "because of your great beauty, entrance expenses paid",
  "because of your great skill as a mountain climber, entrance expenses paid",
  "because of your great skill as a navigator, entrance expenses paid",
  ""
];

var oppCards = [
  {oppType: 0, oppDescription:  0, reqDetail: 0},
  {oppType: 0, oppDescription:  0, reqDetail: 0},
  {oppType: 0, oppDescription:  0, reqDetail: 0},
  {oppType: 0, oppDescription:  1, reqDetail: 1},
  {oppType: 0, oppDescription:  1, reqDetail: 1},
  {oppType: 0, oppDescription:  1, reqDetail: 1},
  {oppType: 0, oppDescription:  2, reqDetail: 0},
  {oppType: 0, oppDescription:  2, reqDetail: 0},
  {oppType: 0, oppDescription:  2, reqDetail: 0},
  {oppType: 0, oppDescription:  3, reqDetail: 0},
  {oppType: 0, oppDescription:  3, reqDetail: 0},
  {oppType: 1, oppDescription:  4, reqDetail: 2},
  {oppType: 0, oppDescription:  5, reqDetail: 0},
  {oppType: 0, oppDescription:  5, reqDetail: 0},
  {oppType: 1, oppDescription:  5, reqDetail: 3},
  {oppType: 0, oppDescription:  6, reqDetail: 0},
  {oppType: 0, oppDescription:  6, reqDetail: 0},
  {oppType: 1, oppDescription:  6, reqDetail: 4},
  {oppType: 0, oppDescription:  7, reqDetail: 7},
  {oppType: 0, oppDescription:  7, reqDetail: 7},
  {oppType: 0, oppDescription:  8, reqDetail: 0},
  {oppType: 0, oppDescription:  8, reqDetail: 0},
  {oppType: 1, oppDescription:  8, reqDetail: 5},
  {oppType: 0, oppDescription:  9, reqDetail: 0},
  {oppType: 0, oppDescription:  9, reqDetail: 0},
  {oppType: 1, oppDescription:  9, reqDetail: 6},
  {oppType: 2, oppDescription: 10, reqDetail: 0},
  {oppType: 2, oppDescription: 10, reqDetail: 0},
];

var expCards = Array(28);
expCards.fill(1, 0, 8);
expCards.fill(2, 8, 16);
expCards.fill(3, 16, 22);
expCards.fill(4, 22);

// Set up opp. and exp. card tracking
var ownOppCardIndices = [];
var ownExpCardIndices = [];
var currentOppCardIndex = 0;
var currentExpCardIndex = 0;

var currentOppCardIndexSpan = document.querySelectorAll('.card-index')[0];
var currentExpCardIndexSpan = document.querySelectorAll('.card-index')[1];
var currentOppCardCountSpan = document.querySelectorAll('.card-count')[0];
var currentExpCardCountSpan = document.querySelectorAll('.card-count')[1];

var remainingOppCardsSpan = document.querySelectorAll('.remaining-cards')[0];
var remainingExpCardsSpan = document.querySelectorAll('.remaining-cards')[1];

var currentOppCard = document.querySelectorAll('.current-card')[0];
var currentOppCardType = document.querySelector('.opp-type');
var currentOppCardDescription = document.querySelector('.opp-description');
var currentOppCardReqDetail = document.querySelector('.req-detail');

var currentExpCard = document.querySelectorAll('.current-card')[1];
var currentExpCardMoveNumber = document.querySelector('.move-number');
var currentExpCardMoveNumberSquares = document.querySelector('.move-number-squares');

var oppCardsLeftArrow = document.querySelectorAll('.left-arrow')[0];
var expCardsLeftArrow = document.querySelectorAll('.left-arrow')[1];
var oppCardsRightArrow = document.querySelectorAll('.right-arrow')[0];
var expCardsRightArrow = document.querySelectorAll('.right-arrow')[1];

var drawOpp = document.querySelectorAll('.draw-card')[0];
var drawExp = document.querySelectorAll('.draw-card')[1];
var useOpp = document.querySelectorAll('.use-card')[0];
var useExp = document.querySelectorAll('.use-card')[1];

function displayCurrentOppCard() {
  if (currentOppCardIndex >= ownOppCardIndices.length)
    currentOppCardIndex = 0;
  else if (currentOppCardIndex < 0)
    currentOppCardIndex = ownOppCardIndices.length - 1;
  oppCardsLeftArrow.disabled = oppCardsRightArrow.disabled = (ownOppCardIndices.length < 2);
  if (ownOppCardIndices.length == 0)
  {
    currentOppCard.classList.add('hidden');
    currentOppCardIndexSpan.innerText = 0;
    currentOppCardCountSpan.innerText = 0;
  }
  else {
    var oppCardInfo = oppCards[ownOppCardIndices[currentOppCardIndex]];
    currentOppCardType.innerText = oppTypes[oppCardInfo.oppType];
    currentOppCardDescription.innerText = oppDescriptions[oppCardInfo.oppDescription];
    currentOppCardReqDetail.innerText = reqDetails[oppCardInfo.reqDetail];
    if (!reqDetails[oppCardInfo.reqDetail])
      currentOppCardDescription.classList.remove('ellipsis-after');
    else
      currentOppCardDescription.classList.add('ellipsis-after');
    currentOppCard.classList.remove('hidden');
    currentOppCardIndexSpan.innerText = currentOppCardIndex + 1;
    currentOppCardCountSpan.innerText = ownOppCardIndices.length;
  }
}

function displayCurrentExpCard() {
  if (currentExpCardIndex >= ownExpCardIndices.length)
    currentExpCardIndex = 0;
  else if (currentExpCardIndex < 0)
    currentExpCardIndex = ownExpCardIndices.length - 1;
  expCardsLeftArrow.disabled = expCardsRightArrow.disabled = (ownExpCardIndices.length < 2);
  if (ownExpCardIndices.length == 0)
  {
    currentExpCard.classList.add('hidden');
    currentExpCardIndexSpan.innerText = 0;
    currentExpCardCountSpan.innerText = 0;
  }
  else {
    var expCardMoveNumber = expCards[ownExpCardIndices[currentExpCardIndex]];
    currentExpCardMoveNumber.innerText = expCardMoveNumber;
    if (expCardMoveNumber == 1)
      currentExpCardMoveNumberSquares.classList.remove('plural');
    else
      currentExpCardMoveNumberSquares.classList.add('plural');
    currentExpCard.classList.remove('hidden');
    currentExpCardIndexSpan.innerText = currentExpCardIndex + 1;
    currentExpCardCountSpan.innerText = ownExpCardIndices.length;
  }
}

function clearOwnCards() {
  ownOppCardIndices = [];
  ownExpCardIndices = [];
  displayCurrentOppCard();
  displayCurrentExpCard();
}

// Card scrolling event listeners
oppCardsLeftArrow.addEventListener('click', function() {
  currentOppCardIndex--;
  displayCurrentOppCard();
});
expCardsLeftArrow.addEventListener('click', function() {
  currentExpCardIndex--;
  displayCurrentExpCard();
});
oppCardsRightArrow.addEventListener('click', function() {
  currentOppCardIndex++;
  displayCurrentOppCard();
});
expCardsRightArrow.addEventListener('click', function() {
  currentExpCardIndex++;
  displayCurrentExpCard();
});

// Card drawing and usage event listeners
drawOpp.addEventListener('click', function() {
  emitGetNewOppCard();
});
drawExp.addEventListener('click', function() {
  emitGetNewExpCard();
});
useOpp.addEventListener('click', function() {
  emitUseOppCard(ownOppCardIndices[currentOppCardIndex]);
  ownOppCardIndices.splice(currentOppCardIndex, 1);
  displayCurrentOppCard();
});
useExp.addEventListener('click', function() {
  emitUseExpCard(ownExpCardIndices[currentExpCardIndex]);
  ownExpCardIndices.splice(currentExpCardIndex, 1);
  displayCurrentExpCard();
});

// Listen for updates to the cards
socket.on('oppCardsList', function(msg) {
  if (hasValidCardIndices(msg))
    ownOppCardIndices = msg.data.cardIndices;
  displayCurrentOppCard();
});
socket.on('expCardsList', function(msg) {
  if (hasValidCardIndices(msg))
    ownExpCardIndices = msg.data.cardIndices;
  displayCurrentExpCard();
});
socket.on('newOppCard', function(msg) {
  if (hasValidCardIndex(msg))
  {
    ownOppCardIndices.push(msg.data.index);
    currentOppCardIndex = ownOppCardIndices.length - 1;
  }
  displayCurrentOppCard();
});
socket.on('newExpCard', function(msg) {
  if (hasValidCardIndex(msg))
  {
    ownExpCardIndices.push(msg.data.index);
    currentExpCardIndex = ownExpCardIndices.length - 1;
  }
  displayCurrentExpCard();
});
socket.on('clearAllCards', function() {
  clearOwnCards();
});
socket.on('updateOppCount', function(msg) {
  if (hasValidCardCount(msg))
  {
    remainingOppCardsSpan.innerText = msg.data.count;
    drawOpp.disabled = (msg.data.count == 0);
  }
});
socket.on('updateExpCount', function(msg) {
  if (hasValidCardCount(msg))
  {
    remainingExpCardsSpan.innerText = msg.data.count;
    drawExp.disabled = (msg.data.count == 0);
  }
});

setTimeout(function() {
  emitGetAllOppCards();
  emitGetAllExpCards();
}, 500);

// Set up reset functionality
var resetButtons = Array.from(document.querySelectorAll('button.reset'));
var confirmationBox = document.querySelector('#confirmation-box');
var resetMessage = document.querySelector('#reset-message');
var resetQuestionFollowUp = document.querySelector('#reset-question-followup');
var yesResetButton = document.querySelector('#reset-yes');
var colourButtons = Array.from(document.querySelectorAll('.btn.counter-colour'));
var resetAllButton = document.querySelector('#reset-all');
var exitResetButtons = Array.from(document.querySelectorAll('.exit-reset'));
var resetFunctions = {
  'reset all counters and cards': resetAllCountersAndCards,
  'reset some counters': resetSomeCounters,
  'reset your own counter and cards': resetOwnCounterAndCards
}

function resetConfirmationBox() {
  confirmationBox.classList = 'continue-reset';
}

function hideConfirmationBox() {
  confirmationBox.classList = 'hidden';
}

function resetAllCounters() {
  draggables.forEach((draggable, index) => {
    emitCounterReset(index);
  });
  hideConfirmationBox();
}

function resetSomeCounters() {
  resetQuestionFollowUp.innerText = 'Which counter(s) should be reset?';
  confirmationBox.classList = 'reset-some';
}

function resetOwnCounterAndCards() {
  resetQuestionFollowUp.innerText = 'What colour is your counter?';
  confirmationBox.classList = 'reset-own';
}

function resetAllCountersAndCards() {
  resetAllCounters();
  emitClearAllCards();
}

// Set up reset event listeners
resetButtons.forEach((resetButton, index) => {
    resetButton.addEventListener('click', function() {
      resetMessage.innerText = this.innerText.toLowerCase();
      resetConfirmationBox();
    });
  }
);
yesResetButton.addEventListener('click', function() {
  if (resetFunctions.hasOwnProperty(resetMessage.innerText))
    resetFunctions[resetMessage.innerText]();
});
exitResetButtons.forEach(exitResetButton => {
  exitResetButton.addEventListener('click', hideConfirmationBox);
});
resetAllButton.addEventListener('click', function() {
  resetAllCounters();
  hideConfirmationBox();
});
colourButtons.forEach((colourButton, index) => {
  colourButton.addEventListener('click', function() {
    emitCounterReset(index);
    if (resetMessage.innerHTML != 'reset some counters')
    {
      clearOwnCards();
      emitClearOwnCards();
      hideConfirmationBox();
    }
  })
});
