chatApp.controller('rtwAppCtrl', function ($scope) {
    // 全域變數
    var mqtt_client;
    // 初始view model的資料與變數
    $scope.vm = {};
    $scope.vm.mqtt_host = "localhost";
    $scope.vm.mqtt_port = "9001";
    $scope.vm.user_id = "";

    $scope.vm.chat_room_name = "";
    $scope.vm.topic = "";
    $scope.vm.message = "";
    $scope.vm.is_connected = false;
    $scope.vm.subscribe_topic = "chat";
    $scope.vm.btn_subscribe = "Subscribe";
    $scope.vm.is_subscribed = false;
    $scope.vm.subscribed_topics = [];
    $scope.vm.inbound_messages = [];
    $scope.vm.online_users = [];
    $scope.vm.online_rooms = [];
    $scope.vm.joined_room = "";
    $scope.vm.online_user_count = 0;

    // 設定UI會觸發的動作
    $scope.action = {};            
    // **動作: 連接MQTT Broker
    $scope.action.connect_mqtt = function () {
        // 檢查user_id不能為空
        if ($scope.vm.user_id.length === 0) {
            alert("User ID could not be empty!")
            return;
        }
    
        // 產生mqtt連結client物件的instance
        mqtt_client = new Paho.MQTT.Client($scope.vm.mqtt_host, Number($scope.vm.mqtt_port), Math.uuid(8, 16));
        // 設定某些事件的回呼處理的functions
        mqtt_client.onConnectionLost = onConnectionLost;
        mqtt_client.onMessageArrived = onMessageArrived;

        // 設定LWT的訊息
        var lastwill_topic = "rtwchat/user/" + $scope.vm.user_id + "/presence";
        var lastwill_msg = new Paho.MQTT.Message("offline");
        lastwill_msg.destinationName = lastwill_topic;
        lastwill_msg.retained = true;

        // 連接mqtt broker
        mqtt_client.connect({ onSuccess: onConnect, willMessage: lastwill_msg });

        // 當成功建立mqtt broker的連結時會被呼叫的function
        function onConnect() {
            // UI元件的控制
            $scope.vm.is_connected = true;

            // 訂閱所有使用者上線的訊息"rtwchat/user/+/presence"
            var presence_topic = "rtwchat/user/+/presence";
            mqtt_client.subscribe(presence_topic);
            $scope.vm.subscribed_topics.push(presence_topic);

            // 送出使用者上線的訊息到"rtwchat/{user_id}/presence"
            var mqtt_message = new Paho.MQTT.Message("online");
            mqtt_message.destinationName = "rtwchat/user/" + $scope.vm.user_id + "/presence";
            mqtt_message.retained = true; // *** 設成保留訊息 ***
            mqtt_client.send(mqtt_message);

            // 訂閱自己的Private-Chat主題"rtwchat/user/+/chat/+"
            var private_chat_topic = "rtwchat/user/" + $scope.vm.user_id + "/chat/+";
            mqtt_client.subscribe(private_chat_topic);
            $scope.vm.subscribed_topics.push(private_chat_topic);

            // 訂閱Chat Room主題"rtwchat/room/#"
            var all_chat_room_topic = "rtwchat/room/+/presence";
            mqtt_client.subscribe(all_chat_room_topic);
            $scope.vm.subscribed_topics.push(all_chat_room_topic);

            $scope.$apply(); //<--這個動作通知angular.js來觸發data-binding的sync
        }
        // 當與mqtt broker的連結被斷開時會被呼叫的function
        function onConnectionLost(responseObject) {
            if (responseObject.errorCode == 0) { //正常的斷線
                console.log("onConnectionLost:" + responseObject.errorMessage);
            }
            else {
                // UI元件的控制
                $scope.vm.is_connected = false;
                $scope.$apply(); //<--這個動作通知angular.js來觸發data-binding的sync
            }
        }
        // 當訂閱的主題有訊息時會被呼叫的callback function
        function onMessageArrived(message) {
            // 把訊息的主要資訊擷取出來
            var topic = message.destinationName;
            // 建構一個訊息資訊物件
            var msgObj = {
                'topic': message.destinationName,
                'retained': message.retained,
                'qos': message.qos,
                'payload': message.payloadString,
                'eventdt': moment().format('YYYY-MM-DD, hh:mm:ss')
            };

            // 使用html的table來秀出訊息
            $scope.vm.inbound_messages.unshift(msgObj); //最新進來的訊息透在最上面   

            // 使用regular expression來偵測是否為"presence"訊息
            var regex = "rtwchat/user/(.+)/presence";
            var found = topic.match(regex);
            if (found) { // this is "Presence" message
                var user_id = found[1]; //get the "userid" from regular expression matching 
                var idx = $scope.vm.online_users.indexOf(user_id); // 檢查在UI的array中是否存在相同的使用者
                if (msgObj.payload == "online") {
                    if (idx == -1)
                        $scope.vm.online_users.push(user_id);
                }
                else {
                    if (idx != -1)
                        $scope.vm.online_users.splice(idx, 1);
                }
                // Update Chart data
                update_chart_data($scope.vm.online_users.length);
            }

            // 使用regular expression來偵測是否為"chat room presence"訊息
            var regex = "rtwchat/room/(.+)/presence";
            var found = topic.match(regex);
            if (found) { 
                var room_name = found[1]; //get the "room name" from regular expression matching 
                var idx = $scope.vm.online_rooms.indexOf(room_name); 
                    if (idx == -1)
                        $scope.vm.online_rooms.push(room_name);
            }

            $scope.$apply();
        }
    };
    // **動作: 斷開MQTT Broker連線
    $scope.action.disconnect_mqtt = function () {
        // 送出要離線的"offline"訊息
        var presence_topic = "rtwchat/user/" + $scope.vm.user_id + "/presence";
        var mqtt_message = new Paho.MQTT.Message("offline");
        mqtt_message.destinationName = presence_topic;
        mqtt_message.retained = true; //設成retained

        mqtt_client.send(mqtt_message);
        update_chart_data();

        // 斷開 MQTT connection
        mqtt_client.disconnect();

        $scope.vm.is_connected = false;
        // 清空UI暫存資料
        $scope.vm.subscribed_topics = [];
        $scope.vm.inbound_messages = [];
        $scope.vm.online_users = [];
    };
    // **動作: 送出訊息
    $scope.action.send_message = function () {
        var chat_room_topic = "rtwchat/room/" + $scope.vm.joined_room + "/message";
        var mqtt_message = new Paho.MQTT.Message($scope.vm.message); 
        // rtwchat/user/{user_id:TO}/chart/{chart_data_type}
        mqtt_message.destinationName = chat_room_topic;
        mqtt_message.retained = false; // 設成retained
        mqtt_client.send(mqtt_message);
    };

    $scope.action.unsubscribe_topic = function (topic_to_unsubscribe) {
        // 要解除訂閱
        mqtt_client.unsubscribe(topic_to_unsubscribe);
        // 移除在UI上的subscribed topics列表
        var idx = $scope.vm.subscribed_topics.indexOf(topic_to_unsubscribe);
        if (idx != -1)
            $scope.vm.subscribed_topics.splice(idx, 1);
    };
    // **動作: 產生"private-chat"的topic
    $scope.action.build_private_chart_topic = function (user_to_chart) {
        // rtwchat/user/{user_id:TO}/chart/{chart_data_type}
        $scope.vm.topic = "rtwchat/user/" + user_to_chart + "/chart";
    };

    $scope.action.join_chat_room = function (chat_room) {
        var chat_room_topic = "rtwchat/room/" + chat_room + "/message";
        if($scope.vm.joined_room === chat_room) {
            alert('Already Joined Chat Room: ' + chat_room);
            return;
        }

        console.log('join chat room: ', chat_room)
        mqtt_client.subscribe(chat_room_topic);
        $scope.vm.subscribed_topics.push(chat_room_topic);
        $scope.vm.joined_room = chat_room;
    };

    $scope.action.create_chat_room = function () {
        const chat_room = $scope.vm.chat_room_name;
        var chat_room_topic = "rtwchat/room/" + chat_room + "/presence";
        
        var idx = $scope.vm.online_rooms.indexOf(chat_room);
        if (idx != -1) {
            alert('Chat Room: ' + chat_room + ' existed!');
            return;
        }

        var chat_room_msg_topic = "rtwchat/room/" + chat_room + "/message";
        mqtt_client.subscribe(chat_room_msg_topic);
        $scope.vm.subscribed_topics.push(chat_room_msg_topic);
        $scope.vm.joined_room = chat_room;
        $scope.vm.chat_room_name = "";

        var mqtt_message = new Paho.MQTT.Message("create");
        mqtt_message.destinationName = chat_room_topic;
        mqtt_message.retained = true; 
        mqtt_client.send(mqtt_message);
    };

    update_chart_data = function (user_count) {
        // 取得原生的highchart的物件instance
        var highchart = $scope.chartConfig.getHighcharts();
        var x = (new Date()).getTime(),
            y = user_count;
        highchart.series[0].addPoint([x, y], true, true);
    };

    $scope.chartConfig = {
        options: {
            //This is the Main Highcharts chart config. Any Highchart options are valid here.
            //will be overriden by values specified below.
            chart: {
                type: 'spline',
                animation: Highcharts.svg, // don't animate in old IE
                marginRight: 10,

            },
            title: {
                text: 'Live User Report'
            },
            xAxis: {
                type: 'datetime',
                tickPixelInterval: 150
            },
            yAxis: {
                title: {
                    text: 'Value'
                },
                plotLines: [{
                    value: 0,
                    width: 1,
                    color: '#808080'
                }]
            }
        },         
        tooltip: {
            formatter: function () {
                return '<b>' + this.series.name + '</b><br/>' +
                    Highcharts.dateFormat('%Y-%m-%d %H:%M:%S', this.x) + '<br/>' +
                    Highcharts.numberFormat(this.y, 2);
            }
        },
        legend: {
            enabled: false
        },
        exporting: {
            enabled: false
        },
        series: [{
            name: 'Live Users',
            data: (function () {
                // generate an array of random data
                let data = [],
                    time = (new Date()).getTime();

                for (i = -2; i <= 0; i += 1) {
                    data.push({
                        x: time + i * 1000,
                        y: 0
                    });
                }
                return data;
            }())
        }]
        
    }; 
});