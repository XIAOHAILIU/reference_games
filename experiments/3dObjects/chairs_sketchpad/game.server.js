/*  Copyright (c) 2012 Sven "FuzzYspo0N" Bergström, 2013 Robert XD Hawkins
    
    written by : http://underscorediscovery.com
    written for : http://buildnewgames.com/real-time-multiplayer/
    
    modified for collective behavior experiments on Amazon Mechanical Turk

    MIT Licensed.
*/
    var
        fs     = require('fs'),
        utils  = require(__base + 'sharedUtils/sharedUtils.js'),
        parser = require('xmldom').DOMParser,
        XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest,
        sendPostRequest = require('request').post;

// This is the function where the server parses and acts on messages
// sent from 'clients' aka the browsers of people playing the
// game. For example, if someone clicks on the map, they send a packet
// to the server with the coordinates of the click, which this
// function reads and applies.
var onMessage = function(client,message) {
  //Cut the message up into sub components
  var message_parts = message.split('.');

  //The first is always the type of message
  var message_type = message_parts[0];  
  
  //Extract important variables
  var gc = client.game;
  var id = gc.id;
  var all = gc.get_active_players();
  var target = gc.get_player(client.userid);
  var others = gc.get_others(client.userid);
  console.log('received message' + message);
  switch(message_type) {
    
  case 'clickedObj' :
    others[0].player.instance.send("s.feedback." + message_parts[1]); 
    target.instance.send("s.feedback." + message_parts[1]);
    
    setTimeout(function() {
      _.map(all, function(p){
        p.player.instance.emit('newRoundUpdate', {user: client.userid} );
      });
      gc.newRound();
    }, 4000);
    break; 
  
  case 'h' : // Receive message when browser focus shifts
    target.visible = message_parts[1];
    break;

  case 'doneDrawing' : // sketcher has declared that drawing is finished
    drawing_status = message_parts[1];
    // console.log('drawing_status in doneDrawing case in server');
    console.log('drawing submitted: ', drawing_status);
      _.map(all, function(p){
        p.player.instance.emit('mutualDoneDrawing', {user: client.userid} )
        //p.player.instance.emit('stroke', {user: client.usedid});
      });

  }
};

/*
  Associates events in onMessage with callback returning json to be saved
  {
    <eventName>: (client, message_parts) => {<datajson>}
  }
  Note: If no function provided for an event, no data will be written
*/
var dataOutput = function() {
  function getIntendedTargetName(objects) {
    return _.filter(objects, o => o.target_status === 'target')[0]['filename'];
  }

  function getObjectLocs(objects) {
    return _.flatten(_.map(objects, o => {
      return [o.filename, o.speakerCoords.gridX, o.listenerCoords.gridX];
    }));
  }

  function getObjectLocHeaderArray() {
    return _.flatten(_.map(_.range(1,4), i => {
      return _.map(['Name', 'SketcherLoc', 'ViewerLoc'], v => 'object' + i + v);
    }));
  };

  function commonOutput (client, message_data) {
    return {
      iterationName: client.game.iterationName,
      gameid: client.game.id,
      time: Date.now(),
      trialNum : client.game.state.roundNum + 1,
      workerId: client.workerid,
      assignmentId: client.assignmentid
    };
  };

  var clickedObjOutput = function(client, message_data) {
    var objects = client.game.trialInfo.currStim;
    var intendedName = getIntendedTargetName(objects);
    // var family = _.filter(objects, o => o.target_status === 'target')[0]['family'];
    // var member = _.filter(objects, o => o.target_status === 'target')[0]['member'];
    // var shapenet_id = _.filter(objects, o => o.target_status === 'target')[0]['shapenet_id'];
    var objLocations = _.zipObject(getObjectLocHeaderArray(), getObjectLocs(objects));
    
    var output =  _.extend(
      commonOutput(client, message_data), {
        intendedName,
        clickedName: message_data[1],
        correct: intendedName === message_data[1],
        pngString: message_data[2],
        condition : message_data[4],
        family : message_data[5],
        intendedMember : 'a',
        clickedMember : message_data[6],
        shapenet_id : message_data[7]
      },
      objLocations
    );
    console.log(JSON.stringify(output, null, 3));
    return output;
  };

  var strokeOutput = function(client, message_data) {
    var objects = client.game.trialInfo.currStim;
    var intendedName = getIntendedTargetName(objects);

    var output = _.extend(
      commonOutput(client, message_data), {
        currStrokeNum: message_data[1],
        intendedName,
        condition : _.filter(objects, o => o.target_status === 'target')[0]['condition'],
        family : _.filter(objects, o => o.target_status === 'target')[0]['family'],
        intendedMember : _.filter(objects, o => o.target_status === 'target')[0]['member'],
        shapenet_id : _.filter(objects, o => o.target_status === 'target')[0]['shapenet_id'],
        shiftKeyUsed: message_data[2],
        svg: message_data.slice(3).join(".")
      }
    );
    console.log(JSON.stringify(output, null, 3));
    return output;
  };

  return {
    'stroke' : strokeOutput,
    'clickedObj' : clickedObjOutput
  };
}();

var setCustomEvents = function(socket) {
  socket.on('stroke', function(data) {
    // save svg to file...
    var others = socket.game.get_others(socket.userid);
    var xmlDoc = new parser().parseFromString(data.svgString);
    var svgData = xmlDoc.documentElement.getAttribute('d');
    var shiftKeyUsed = data.shiftKeyUsed;
//    writeData(socket, 'stroke', [data.currStrokeNum, svgData, shiftKeyUsed]);

    var packet = [data.jsonString, ['stroke', data.currStrokeNum, shiftKeyUsed, svgData]];

    // send json format to partner
    _.map(others, function(p) {
      p.player.instance.emit('stroke', packet);  
    });                                                     
  });



};

module.exports = {
  setCustomEvents : setCustomEvents,
  onMessage : onMessage,
  dataOutput : dataOutput
};
