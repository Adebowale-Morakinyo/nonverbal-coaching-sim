package llm

import (
	"encoding/json"
	"testing"
)

func TestParseReportJSONAcceptsObject(t *testing.T) {
	raw, err := parseReportJSON(`{"answer_structure":{"score":4,"comment":"Clear."}}`)
	if err != nil {
		t.Fatalf("parse report json: %v", err)
	}

	var output map[string]any
	if err := json.Unmarshal(raw, &output); err != nil {
		t.Fatalf("unmarshal parsed json: %v", err)
	}
	if _, ok := output["answer_structure"]; !ok {
		t.Fatal("expected answer_structure")
	}
}

func TestParseReportJSONExtractsObjectFromProse(t *testing.T) {
	raw, err := parseReportJSON(`The report is:
{"answer_structure":{"score":4,"comment":"Clear."}}
Thanks.`)
	if err != nil {
		t.Fatalf("parse report json: %v", err)
	}

	var output map[string]any
	if err := json.Unmarshal(raw, &output); err != nil {
		t.Fatalf("unmarshal parsed json: %v", err)
	}
	if _, ok := output["answer_structure"]; !ok {
		t.Fatal("expected answer_structure")
	}
}

func TestParseReportJSONRejectsNonObject(t *testing.T) {
	if _, err := parseReportJSON(`["not","a","report"]`); err == nil {
		t.Fatal("expected parse error")
	}
}
