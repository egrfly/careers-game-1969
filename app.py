from flask import Flask, render_template, request, make_response, redirect
from flask_socketio import SocketIO, emit
from math import sqrt, ceil
from copy import deepcopy
from random import shuffle, choice, randint

app = Flask(__name__)
socketio = SocketIO(app)

initial_counters_state = [
    {'left': 1217, 'top': 796, 'selected': False, 'colour': 'purple', 'interrupt': False},
    {'left': 1217, 'top': 866, 'selected': False, 'colour': 'red', 'interrupt': False},
    {'left': 1217, 'top': 936, 'selected': False, 'colour': 'yellow', 'interrupt': False},
    {'left': 1217, 'top': 1006, 'selected': False, 'colour': 'green', 'interrupt': False},
    {'left': 1217, 'top': 1076, 'selected': False, 'colour': 'blue', 'interrupt': False},
    {'left': 1217, 'top': 1146, 'selected': False, 'colour': 'black', 'interrupt': False}
]
counters_state = deepcopy(initial_counters_state)

dice_state = [
    {'number': 'one', 'active': False},
    {'number': 'two', 'active': False},
    {'number': 'six', 'active': False}
]

numbers = ['one', 'two', 'three', 'four', 'five', 'six']
numbers_array = [[deepcopy(numbers), deepcopy(numbers)] for i in range(3)]

random_adjectives = ['Naughty', 'Spicy', 'Special', 'Extreme', 'Magic', 'Shiny', 'Awful', 'Spooky', 'Suboptimal', 'Rude']
random_nouns = ['Zebra', 'Notepad', 'Breakfast', 'Bookmark', 'Anorak', 'Slippers', 'Seal', 'Dingbat', 'Teabag', 'Bathtowel']
random_meetings = ['Expo', 'Conference', 'Meetup', 'Gathering', 'SupportGroup', 'Syndicate', 'Society', 'Conspiracy', 'Congress', 'Club']

active_sessions = []

opp_cards_state = [None for i in range(28)]
exp_cards_state = [None for i in range(28)]

opp_cards_queue = [i for i in range(28)]
exp_cards_queue = [i for i in range(28)]
shuffle(opp_cards_queue)
shuffle(exp_cards_queue)

def has_valid_counter(message):
    return isinstance(message, dict) and 'data' in message and isinstance(message['data'], dict) and \
        'counter' in message['data'] and isinstance(message['data']['counter'], int) and \
            message['data']['counter'] >= 0 and message['data']['counter'] < len(counters_state)

def has_valid_coords(message):
    return isinstance(message, dict) and 'data' in message and isinstance(message['data'], dict) and \
        'left' in message['data'] and isinstance(message['data']['left'], (int, float)) and \
            'top' in message['data'] and isinstance(message['data']['top'], (int, float)) and \
                message['data']['left'] > 0 and round(message['data']['left']) <= 1223 and \
                    message['data']['top'] > 0 and round(message['data']['top']) <= 1153 and \
                        (round(message['data']['left']) <= 1153 or round(message['data']['top']) >= 790 or \
                            'onPath' in message['data'] and message['data']['onPath'])

def has_valid_dice_count(message):
    return isinstance(message, dict) and 'data' in message and isinstance(message['data'], dict) and \
        'both' in message['data'] and isinstance(message['data']['both'], bool)

def has_valid_card_index(message):
    return isinstance(message, dict) and 'data' in message and isinstance(message['data'], dict) and \
        'index' in message['data'] and isinstance(message['data']['index'], int) and \
            message['data']['index'] >= 0 and message['data']['index'] < 28

def has_correct_sid_format(sid):
    split_sid = sid.split('.')
    return len(split_sid) == 4 and split_sid[0] in random_adjectives and split_sid[1] in random_nouns and \
        split_sid[2] in random_meetings and split_sid[3].isdigit() and int(split_sid[3]) >= 1000 and \
            int(split_sid[3]) <= 9999

def emit_counter_move(data):
    counters_state[data['counter']]['left'] = data['left']
    counters_state[data['counter']]['top'] = data['top']
    emit('counterMove', {'data': data}, broadcast=True)

def emit_counter_select(data):
    counters_state[data['counter']]['selected'] = True
    emit('counterSelect', {'data': data}, broadcast=True)

def emit_counter_unselect(data):
    counters_state[data['counter']]['selected'] = False
    emit('counterUnselect', {'data': data}, broadcast=True)

def emit_dice_disable(data):
    if data['both']:
        dice_state[0]['active'] = True
        dice_state[1]['active'] = True
    else:
        dice_state[2]['active'] = True
    emit('diceDisable', {'data': data}, broadcast=True)

def emit_dice_enable(data):
    if data['both']:
        dice_state[0]['active'] = False
        dice_state[1]['active'] = False
    else:
        dice_state[2]['active'] = False
    emit('diceEnable', {'data': data}, broadcast=True)

def emit_dice_state_update(data):
    if data['both']:
        dice_state[0]['number'] = data['dice1'][-1]
        dice_state[1]['number'] = data['dice2'][-1]
    else:
        dice_state[2]['number'] = data['dice1'][-1]
    emit('diceUpdate', {'data': data}, broadcast=True)

def emit_counter_move_smoothly(index, move_to):
    counters_state[index]['interrupt'] = True
    socketio.sleep(0.004)
    counters_state[index]['interrupt'] = False
    change_left = move_to['left'] - counters_state[index]['left']
    change_top = move_to['top'] - counters_state[index]['top']
    change_dist = sqrt((change_left * change_left) + (change_top * change_top))
    if not change_dist:
        return
    unit_change_left = change_left / change_dist
    unit_change_top = change_top / change_dist
    emit_counter_select({'sid': None, 'counter': index, 'override': True})
    for step in range(0, ceil(change_dist)):
        if counters_state[index]['interrupt']:
            return
        socketio.sleep(0.002)
        emit_counter_move({'sid': None, 'counter': index, 'left': counters_state[index]['left'] + unit_change_left, 'top': counters_state[index]['top'] + unit_change_top, 'onPath': True})
    socketio.sleep(0.002)
    emit_counter_move({'sid': None, 'counter': index, 'left': move_to['left'], 'top': move_to['top']})
    emit_counter_unselect({'sid': None, 'counter': index, 'override': True})

def emit_counter_reset(index):
    emit_counter_move_smoothly(index, initial_counters_state[index])

def shuffle_dice_order(first_half, second_half):
    shuffle(first_half)
    shuffle(second_half)
    while first_half[5] == second_half[0]:
        shuffle(first_half)

def emit_dice_roll(both):
    emit_dice_disable({'both': both})
    dice_1_first_half = numbers_array[0 if both else 2][0]
    dice_1_second_half = numbers_array[0 if both else 2][1]
    dice_2_first_half = numbers_array[1][0]
    dice_2_second_half = numbers_array[1][1]
    shuffle_dice_order(dice_1_first_half, dice_1_second_half)
    if both:
        shuffle_dice_order(dice_2_first_half, dice_2_second_half)
    emit_dice_state_update({
        'both': both,
        'dice1': dice_1_first_half + dice_1_second_half,
        'dice2': dice_2_first_half + dice_2_second_half
    })
    socketio.sleep(2.2)
    emit_dice_enable({'both': both})

def emit_opp_cards_list(data):
    emit('oppCardsList', {'data': data})

def emit_exp_cards_list(data):
    emit('expCardsList', {'data': data})

def emit_new_opp_card(data, sid):
    opp_cards_state[data['index']] = sid
    emit('newOppCard', {'data': data})

def emit_new_exp_card(data, sid):
    exp_cards_state[data['index']] = sid
    emit('newExpCard', {'data': data})

def emit_update_opp_count(data):
    emit('updateOppCount', {'data': data}, broadcast=True)

def emit_update_exp_count(data):
    emit('updateExpCount', {'data': data}, broadcast=True)

def emit_clear_all_cards():
    emit('clearAllCards', broadcast=True)

def reshuffle_cards():
    opp_cards_queue[:] = [index for index in range(28) if opp_cards_state[index] == None]
    exp_cards_queue[:] = [index for index in range(28) if exp_cards_state[index] == None]
    shuffle(opp_cards_queue)
    shuffle(exp_cards_queue)

@app.route('/')
def show_board():
    resp = make_response(render_template('board.html', counters_state=counters_state, dice_state=dice_state))
    if request.cookies.get('sid') not in active_sessions:
        while True:
            new_sid = f"{choice(random_adjectives)}.{choice(random_nouns)}.{choice(random_meetings)}.{randint(1000, 9999)}"
            if new_sid not in active_sessions:
                break
        active_sessions.append(new_sid)
        resp.set_cookie('sid', new_sid, max_age=60*60*24*365*2)
    return resp

@app.route('/ping')
def accept_ping():
    return 'Successfully pinged careers.emilyflynn.co.uk'

@socketio.on('counterMove', namespace='/sync')
def move_counter(message):
    if has_valid_counter(message) and has_valid_coords(message):
        emit_counter_move(message['data'])

@socketio.on('counterSelect', namespace='/sync')
def select_counter(message):
    if has_valid_counter(message):
        emit_counter_select(message['data'])

@socketio.on('counterUnselect', namespace='/sync')
def unselect_counter(message):
    if has_valid_counter(message):
        emit_counter_unselect(message['data'])

@socketio.on('counterReset', namespace='/sync')
def reset_counter(message):
    if has_valid_counter(message):
        emit_counter_reset(message['data']['counter'])

@socketio.on('counterMoveSmoothly', namespace='/sync')
def move_counter_smoothly(message):
    if has_valid_counter(message) and has_valid_coords(message):
        emit_counter_move_smoothly(message['data']['counter'], message['data'])

@socketio.on('diceRoll', namespace='/sync')
def roll_dice(message):
    if has_valid_dice_count(message) and \
        (message['data']['both'] and not dice_state[0]['active'] and not dice_state[1]['active']) or \
        (not message['data']['both'] and not dice_state[2]['active']):
        emit_dice_roll(message['data']['both'])

@socketio.on('getAllOppCards', namespace='/sync')
def return_all_opp_cards():
    sid = request.cookies.get('sid')
    card_indices = []
    if has_correct_sid_format(sid) and sid not in active_sessions:
        active_sessions.append(sid)
    if sid in active_sessions:
        card_indices = [index for index in range(28) if opp_cards_state[index] == sid]
    emit_opp_cards_list({'cardIndices': card_indices})
    emit_update_opp_count({'count': opp_cards_state.count(None)})

@socketio.on('getAllExpCards', namespace='/sync')
def return_all_exp_cards():
    sid = request.cookies.get('sid')
    card_indices = []
    if has_correct_sid_format(sid) and sid not in active_sessions:
        active_sessions.append(sid)
    if sid in active_sessions:
        card_indices = [index for index in range(28) if exp_cards_state[index] == sid]
    emit_exp_cards_list({'cardIndices': card_indices})
    emit_update_exp_count({'count': exp_cards_state.count(None)})

@socketio.on('getNewOppCard', namespace='/sync')
def return_new_opp_card():
    sid = request.cookies.get('sid')
    chosen_card = -1
    if has_correct_sid_format(sid) and sid not in active_sessions:
        active_sessions.append(sid)
    if sid in active_sessions and len(opp_cards_queue) > 0:
        chosen_card = opp_cards_queue.pop(0)
    emit_new_opp_card({'index': chosen_card}, sid)
    emit_update_opp_count({'count': opp_cards_state.count(None)})

@socketio.on('getNewExpCard', namespace='/sync')
def return_new_exp_card():
    sid = request.cookies.get('sid')
    chosen_card = -1
    if has_correct_sid_format(sid) and sid not in active_sessions:
        active_sessions.append(sid)
    if sid in active_sessions and len(exp_cards_queue) > 0:
        chosen_card = exp_cards_queue.pop(0)
    emit_new_exp_card({'index': chosen_card}, sid)
    emit_update_exp_count({'count': exp_cards_state.count(None)})

@socketio.on('useOppCard', namespace='/sync')
def use_opp_card(message):
    sid = request.cookies.get('sid')
    if has_valid_card_index(message) and opp_cards_state[message['data']['index']] == sid:
        opp_cards_state[message['data']['index']] = None
        opp_cards_queue.append(message['data']['index'])
    emit_update_opp_count({'count': opp_cards_state.count(None)})

@socketio.on('useExpCard', namespace='/sync')
def use_exp_card(message):
    sid = request.cookies.get('sid')
    if has_valid_card_index(message) and exp_cards_state[message['data']['index']] == sid:
        exp_cards_state[message['data']['index']] = None
        exp_cards_queue.append(message['data']['index'])
    emit_update_exp_count({'count': exp_cards_state.count(None)})

@socketio.on('clearOwnCards', namespace='/sync')
def clear_own_cards():
    sid = request.cookies.get('sid')
    if not sid:
        sid = None
    for index in range(28):
        if opp_cards_state[index] == sid:
            opp_cards_state[index] = None
        if exp_cards_state[index] == sid:
            exp_cards_state[index] = None
    emit_update_opp_count({'count': opp_cards_state.count(None)})
    emit_update_exp_count({'count': exp_cards_state.count(None)})

@socketio.on('clearAllCards', namespace='/sync')
def clear_all_cards():
    for index in range(28):
        opp_cards_state[index] = None
        exp_cards_state[index] = None
    emit_clear_all_cards()
    emit_update_opp_count({'count': opp_cards_state.count(None)})
    emit_update_exp_count({'count': exp_cards_state.count(None)})
    reshuffle_cards()

@app.errorhandler(404)
def handle_error(error):
    return redirect('/')

if __name__ == '__main__':
    socketio.run(app)
