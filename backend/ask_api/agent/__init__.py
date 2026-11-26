"""The Ask agent (v3): the visitor's model answers by calling our tools in a loop.

    model.py   the neutral message format and the Model interface every provider adapter implements
    prompt.py  the system prompt (what the model knows) and the loop-control tools
               (triage, final_answer, ask_user, out_of_scope)
    loop.py    run_agent: triage -> tool calls -> final answer -> number check -> answer

The tools themselves are in ask_api/tools/ (see tools/registry.py).
"""
