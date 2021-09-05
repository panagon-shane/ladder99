# Architecture

Data flows from devices through the Adapter, Agent, and Relay to the Database, Dashboard, and other applications.

## Diagram

![img](../../design/architecture.dot.svg)

## How it works

The Adapter polls or subscribes to messages from devices, and translates them to SHDR (Simple Hierarchical Data Representation), eg "2021-02-28T02:40:00|key|value", which it sends on to the Agent.

The Agent fits that data into an XML tree representing the device structures. This XML can be viewed in the browser, or transformed into HTML.

The Relay then consumes the XML and feeds it to the Database and Dashboard.

<!-- MQTT is a publish/subscribe message protocol. Messages from factory devices go to an MQTT Broker (Mosquitto). -->
<!-- via an optional one-way data diode (Java + RabbitMQ) -->