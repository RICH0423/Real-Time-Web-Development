chatApp.controller('chatAppCtrl', function ($scope) {
    let mqtt_client;

    $scope.vm = {};
    $scope.vm.mqtt_host = "localhost";
    $scope.vm.mqtt_port = "9001";
    $scope.vm.topic = "";
    $scope.vm.message = "";
    $scope.vm.messages = [];
    $scope.vm.isConnected = false;

    $scope.action = {};

    $scope.action.sendMessage = function () {
        console.log("sendMessage!");
        let message = $scope.vm.message;
        let mqtt_message = new Paho.MQTT.Message($scope.vm.message);
        mqtt_message.destinationName = $scope.vm.topic;
        mqtt_client.send(mqtt_message);
        console.log("Send message success, message: ", message);

        resetMessage();
    };

    $scope.action.disConnectMqtt = function () {
        console.log("disConnectMqtt!");
        mqtt_client.disconnect();
        $scope.vm.isConnected = false;
    };

    $scope.action.connectMqtt = function () {
        console.log("connectMqtt!");
        if(!$scope.vm.topic) {
            alert("Please input topic!");
            return;
        }

        mqtt_client = new Paho.MQTT.Client($scope.vm.mqtt_host, 
            Number($scope.vm.mqtt_port), Math.uuid(8, 16));
        mqtt_client.onConnectionLost = onConnectionLost;
        mqtt_client.connect({ onSuccess: onConnect });
        mqtt_client.onMessageArrived = onMessageArrived;

        function onConnect() {
            console.log("onConnect!");
            $scope.vm.isConnected = true;
            $scope.$apply();

            mqtt_client.subscribe($scope.vm.topic);
            console.log("subscribe topic success!");
        }

        function onConnectionLost(responseObject) {
            if (responseObject.errorCode !== 0) {
                console.log("onConnectionLost: ", responseObject.errorMessage);
                $scope.vm.isConnected = false;
                $scope.$apply();
            }
        }

        function onMessageArrived(msg) {
            console.log("onMessageArrived!");
            let topic = msg.destinationName;
            console.log("Received message: ", msg.payloadString); 

            $scope.vm.messages.push({
                message: msg.payloadString
            });
            $scope.$apply();
        }
    };

    resetMessage = function () {
        $scope.vm.message = "";
    };
});