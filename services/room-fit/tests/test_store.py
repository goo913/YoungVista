from room_fit.store import superseded


def test_a_newer_fit_of_the_scan_supersedes_an_older_run():
    doc = {"ownerId": "u1", "status": "queued", "info": {"runId": "run-2"}}
    assert superseded(doc, "run-1")
    assert not superseded(doc, "run-2")
    # Started by hand (no run id), or a document from before run ids: never superseded.
    assert not superseded(doc, None)
    assert not superseded({"ownerId": "u1", "status": "queued", "info": {}}, "run-1")
    assert not superseded(None, "run-1")
