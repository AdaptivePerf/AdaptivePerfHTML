#include <nlohmann/json.hpp>
#include "tree_parse.hpp"
#include <iostream>
#include <fstream>

using json = nlohmann::json;

TreeNode parse_json_to_tree(const json &j_node) {
  TreeNode node;
  node.name = j_node.value("name", "");
  node.value = 0;

  if (j_node.contains("value")) {
    node.value = j_node["value"].get<uint64_t>();
  }

  node.cold = j_node.value("cold", false);
  node.left_sum = 0;

  if (j_node.contains("children")) {
    for (const auto &child : j_node["children"]) {
      node.children.push_back(parse_json_to_tree(child));
    }
  }

  return node;
}

json tree_to_json(const TreeNode &node) {
  json j_node;
  j_node["name"] = node.name;
  j_node["value"] = node.value;
  j_node["left_sum"] = node.left_sum;
  j_node["cold"] = node.cold;

  for (const auto &child : node.children) {
    j_node["children"].push_back(tree_to_json(child));
  }

  return j_node;
}

void save_json_to_file(const json &j, const std::string &filename) {
  std::ofstream file(filename);
  if (file.is_open()) {
    file << j.dump();
    file.close();
  } else {
    std::cerr << "Unable to open file: " << filename << std::endl;
  }
}

void print_tree(const TreeNode &node, int level = 0) {
  std::string indent(level * 2, ' ');
  std::cout << indent << "Name: " << node.name << ", Value: " <<
    node.value << ", Left Sum: " << node.left_sum << "\n";
  for (const auto &child : node.children) {
    print_tree(child, level + 1);
  }
}

int main() {
  std::ifstream file("data2.json"); // this is only for test
  json j;
  file >> j;

  u_int16_t start_time = 0;

  if (j.contains("first_time")) {
    start_time = j["first_time"].get<uint64_t>();
  }

  if (j.contains("walltime") && j["walltime"].size() > 1) {
    TreeNode second_node = parse_json_to_tree(j["walltime"][1]); // time ordered json

    uint64_t running_sum = 0;
    calculate_left_sum(second_node, running_sum);

    uint64_t threshold_left =  100000000; // - start_time if needed
    uint64_t threshold_right = 200000000; // - start_time if needed

    TreeNode pruned_tree = prune_tree(second_node, threshold_left,
                                      threshold_right);

    json pruned_tree_json = tree_to_json(pruned_tree);
    save_json_to_file(pruned_tree_json, "pruned_tree.json");

    // tree that only includes nodes which overlap with the time period
    // between with two thresholds
    std::cout << "\nFull Tree :\n";
    print_tree(second_node);

    // tree that only includes nodes which overlap with the time period
    // between with two thresholds
    std::cout << "\nPruned Tree :\n";
    print_tree(pruned_tree);

  } else {
    std::cerr << "The walltime array does not have at least two elements." << std::endl;
  }

  return 0;
}
