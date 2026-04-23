# chatviz

chatviz is a tool for realtime AI chat vizualization. It is configured as a proxy between your agent and the LLM and captures and vizualizes the interactions in real time. It is designed to be lightweight and easy to use, with minimal configuration required.

# technical details

chatziv is a proxy server that intercepts the communication between your agent and the LLM. It captures the messages sent and received, and sends them to a frontend for vizualization. The frontend is built using React and D3.js, and provides a real-time view of the interactions between your agent and the LLM. 

# usage

To use chatviz, you need to configure your agent to use the chatviz proxy server as its LLM endpoint. You can do this by setting the `LLM_ENDPOINT` environment variable to the address of the chatviz server. For example:

```
export LLM_ENDPOINT=http://localhost:7890
```
Once you have configured your agent, you can start the chatviz server by running the following command:

```
python -m chatviz
```
or 
```
uvx chatviz
```

This will start the chatviz server on port 7890. You can then access the frontend by opening your web browser and navigating to `http://localhost:7890`. You should see a  real-time view of the interactions between your agent and the LLM. Click on the messages to see more details, such as the content of the message and the timestamp. You can also filter the messages by type (e.g., user messages, agent messages, LLM responses) to focus on specific interactions. 

# vizualization

All components of the message are colorcoded; system prompt, mcp servers, user messages, agent messages, and LLM responses all have different colors. This allows you to quickly identify the different types of messages and understand the flow of the conversation. The frontend also provides a timeline view of the interactions, allowing you to see the sequence of messages and how they relate to each other. You can also click on individual messages to see more details, such as the content of the message and the timestamp. This can help you understand the context of the conversation and identify any issues or areas for improvement in your agent's interactions with the LLM.

The UI also displays API family (anthropic, openai, ollama, etc.) and the model used for each LLM response, allowing you to see which models are being used and how they are performing in real time. This can help you identify any issues with specific models or API families and make informed decisions about which models to use for your agent.