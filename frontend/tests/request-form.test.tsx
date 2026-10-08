import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RequestForm } from "@/features/purchase-requests/components/RequestForm";

afterEach(cleanup);

describe("구매요청 등록 화면", () => {
  it("스펙을 추가하고 삭제할 수 있다", () => {
    render(<RequestForm />);
    fireEvent.click(screen.getByRole("button", { name: /스펙 추가하기/ }));
    expect(screen.getByRole("textbox", { name: "스펙 1" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "스펙 1 삭제" }));
    expect(screen.queryByRole("textbox", { name: "스펙 1" })).not.toBeInTheDocument();
  });

  it("유효한 입력을 제출하면 저장 예정 안내만 보여준다", () => {
    render(<RequestForm />);
    fireEvent.change(screen.getByRole("textbox", { name: /제목/ }), { target: { value: "아이폰 15 구해요" } });
    fireEvent.change(screen.getByRole("combobox", { name: /카테고리/ }), { target: { value: "digital" } });
    fireEvent.change(screen.getByRole("textbox", { name: /설명/ }), { target: { value: "상태 좋은 아이폰을 찾고 있어요." } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /최소 희망 가격/ }), { target: { value: "300000" } });
    fireEvent.change(screen.getByRole("spinbutton", { name: /최대 희망 가격/ }), { target: { value: "450000" } });
    fireEvent.change(screen.getByRole("textbox", { name: /거래 희망 지역/ }), { target: { value: "서울 마포구" } });
    fireEvent.click(screen.getByRole("button", { name: /구매요청 미리 등록하기/ }));
    expect(screen.getByRole("status")).toHaveTextContent("3단계에서 실제 등록이 연결됩니다");
  });
});
